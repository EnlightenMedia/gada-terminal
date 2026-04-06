import '@xterm/xterm/css/xterm.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { LaunchOptions, FolderSettings, ToolEvent, ApiRequestEvent, PermissionRequest, PermissionDecision } from './types';

// ── Terminal setup ────────────────────────────────────────────────────────────

const terminal = new Terminal({
  cursorBlink: true,
  fontSize: 14,
  fontFamily: 'Cascadia Code, Consolas, monospace',
  theme: {
    background: '#1e1e1e',
    foreground: '#cccccc',
  },
});

const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);

const container = document.getElementById('terminal-container') as HTMLElement;
terminal.open(container);

fitAddon.fit();
window.electronAPI.sendResize(terminal.cols, terminal.rows);
window.electronAPI.sendReady();

function fitAndResize(): void {
  fitAddon.fit();
  window.electronAPI.sendResize(terminal.cols, terminal.rows);
}

window.addEventListener('resize', fitAndResize);
const resizeObserver = new ResizeObserver(() => fitAndResize());
resizeObserver.observe(container);

window.electronAPI.onTerminalData((data: string) => terminal.write(data));

window.electronAPI.onTerminalExit((code: number) => {
  terminal.write(`\r\n\x1b[90m[Claude exited with code ${code}]\x1b[0m\r\n`);
});

terminal.onData((data: string) => window.electronAPI.sendInput(data));

terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
  if (e.type === 'keydown' && e.ctrlKey && e.key === 'v') {
    window.electronAPI.readClipboard().then((text: string) => {
      if (text) terminal.paste(text);
    });
    return false;
  }
  return true;
});

document.addEventListener('paste', (e: ClipboardEvent) => {
  e.preventDefault();
  e.stopPropagation();
}, true);

container.addEventListener('contextmenu', (e: MouseEvent) => {
  e.preventDefault();
  const selection = terminal.getSelection();
  if (selection) {
    window.electronAPI.writeClipboard(selection);
  } else {
    window.electronAPI.readClipboard().then((text: string) => terminal.paste(text));
  }
}, true);

window.addEventListener('dragover', (e: DragEvent) => e.preventDefault());
window.addEventListener('drop', (e: DragEvent) => e.preventDefault());
container.addEventListener('dragenter', () => container.classList.add('drag-over'));
container.addEventListener('dragleave', () => container.classList.remove('drag-over'));
container.addEventListener('drop', (e: DragEvent) => {
  e.preventDefault();
  container.classList.remove('drag-over');
  if (!e.dataTransfer?.files.length) return;
  const paths: string[] = [];
  for (const file of Array.from(e.dataTransfer.files)) {
    const filePath = window.electronAPI.getPathForFile(file);
    if (filePath) paths.push(filePath);
  }
  if (paths.length > 0) {
    const quoted = paths.map(p => p.includes(' ') ? `"${p}"` : p);
    window.electronAPI.sendInput(quoted.join(' '));
  }
});

// ── Panel (sidebar) ───────────────────────────────────────────────────────────

const ALL_SECTIONS = ['tools', 'permissions', 'cost', 'context'];
const DEFAULT_HIDDEN = new Set(['permissions', 'cost', 'context']);

let sectionOrder: string[] = [...ALL_SECTIONS];
const hiddenSections: Set<string> = new Set(DEFAULT_HIDDEN);

function savePanelLayout(): void {
  window.electronAPI.setPanelLayout(selectedFolder ?? '', {
    order: sectionOrder,
    hidden: [...hiddenSections],
  });
}

function applyPanelState(): void {
  const sectionsContainer = document.getElementById('panel-sections')!;
  for (const id of sectionOrder) {
    const el = document.getElementById(`section-${id}`);
    if (el) sectionsContainer.appendChild(el);
  }
  for (const id of sectionOrder) {
    const el = document.getElementById(`section-${id}`);
    if (el) el.classList.toggle('hidden', hiddenSections.has(id));
  }
  document.querySelectorAll<HTMLButtonElement>('.panel-toggle-btn').forEach(btn => {
    const id = btn.dataset.section!;
    btn.classList.toggle('active', !hiddenSections.has(id));
  });
}

document.querySelectorAll<HTMLButtonElement>('.panel-toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.section!;
    if (hiddenSections.has(id)) hiddenSections.delete(id);
    else hiddenSections.add(id);
    applyPanelState();
    savePanelLayout();
  });
});

// Section drag-and-drop reorder
let dragSectionId: string | null = null;

document.querySelectorAll<HTMLElement>('.panel-section').forEach(section => {
  const id = section.dataset.sectionId!;

  section.addEventListener('dragstart', (e) => {
    dragSectionId = id;
    e.dataTransfer!.effectAllowed = 'move';
  });

  section.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (dragSectionId === id) return;
    section.classList.add('drag-target-above');
  });

  section.addEventListener('dragleave', () => {
    section.classList.remove('drag-target-above');
  });

  section.addEventListener('drop', (e) => {
    e.preventDefault();
    section.classList.remove('drag-target-above');
    if (!dragSectionId || dragSectionId === id) return;
    const fromIdx = sectionOrder.indexOf(dragSectionId);
    const toIdx = sectionOrder.indexOf(id);
    sectionOrder.splice(fromIdx, 1);
    sectionOrder.splice(toIdx, 0, dragSectionId);
    applyPanelState();
    savePanelLayout();
    dragSectionId = null;
  });

  section.addEventListener('dragend', () => {
    document.querySelectorAll('.panel-section').forEach(s =>
      s.classList.remove('drag-target-above')
    );
    dragSectionId = null;
  });
});

applyPanelState();

// ── Tool cards ────────────────────────────────────────────────────────────────

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function extractTarget(toolName: string, input: Record<string, unknown>): string {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  switch (toolName) {
    case 'Read': case 'Edit': case 'Write':
      return str(input['file_path']);
    case 'Bash':
      return str(input['command']);
    case 'Glob': case 'Grep':
      return str(input['pattern']);
    case 'WebFetch':
      return str(input['url']);
    case 'WebSearch':
      return str(input['query']);
    case 'Agent':
      return str(input['prompt']).slice(0, 80);
    default:
      return JSON.stringify(input).slice(0, 80);
  }
}

const toolCardMap = new Map<string, HTMLElement>();
const toolsFeed = document.getElementById('tools-feed') as HTMLElement;

function createToolCard(event: ToolEvent): HTMLElement {
  const card = document.createElement('div');
  card.className = 'tool-card';

  const header = document.createElement('div');
  header.className = 'tool-card-header';

  const time = document.createElement('span');
  time.className = 'tool-card-time';
  time.textContent = formatTime(event.timestamp);

  const name = document.createElement('span');
  name.className = 'tool-card-name';
  name.textContent = event.toolName;

  const badge = document.createElement('span');
  badge.className = 'tool-badge running';
  badge.textContent = 'running';

  header.appendChild(time);
  header.appendChild(name);
  header.appendChild(badge);

  const target = document.createElement('div');
  target.className = 'tool-card-target';
  target.textContent = extractTarget(event.toolName, event.input);

  const details = document.createElement('div');
  details.className = 'tool-card-details';
  details.textContent = JSON.stringify(event.input, null, 2);

  card.appendChild(header);
  card.appendChild(target);
  card.appendChild(details);

  card.addEventListener('click', () => card.classList.toggle('expanded'));

  return card;
}

function updateToolCard(card: HTMLElement, event: ToolEvent): void {
  const badge = card.querySelector<HTMLElement>('.tool-badge')!;
  if (event.event === 'PostToolUse') {
    badge.className = 'tool-badge done';
    badge.textContent = 'done';
  } else {
    badge.className = 'tool-badge failed';
    badge.textContent = 'failed';
  }
  const details = card.querySelector<HTMLElement>('.tool-card-details')!;
  const inputJson = JSON.stringify(event.input, null, 2);
  const extra = event.output
    ? `\n\n--- Response ---\n${event.output}`
    : event.error
      ? `\n\n--- Error ---\n${event.error}`
      : '';
  details.textContent = inputJson + extra;
}

window.electronAPI.onToolEvent((event: ToolEvent) => {
  if (event.event === 'PreToolUse') {
    const card = createToolCard(event);
    toolCardMap.set(event.id, card);
    toolsFeed.prepend(card);
  } else {
    const card = toolCardMap.get(event.id);
    if (card) updateToolCard(card, event);
  }
});

// ── Permission cards ──────────────────────────────────────────────────────────

const permFeed = document.getElementById('permissions-feed') as HTMLElement;

function showPermissionsSection(): void {
  if (!hiddenSections.has('permissions')) return;
  hiddenSections.delete('permissions');
  applyPanelState();
}

function createPermCard(req: PermissionRequest): HTMLElement {
  const card = document.createElement('div');
  card.className = 'perm-card';

  const header = document.createElement('div');
  header.className = 'perm-card-header';

  const time = document.createElement('span');
  time.className = 'perm-card-time';
  time.textContent = formatTime(req.timestamp);

  const name = document.createElement('span');
  name.className = 'perm-card-name';
  name.textContent = req.toolName;

  const badge = document.createElement('span');
  badge.className = 'perm-badge pending';
  badge.textContent = 'waiting';

  header.appendChild(time);
  header.appendChild(name);
  header.appendChild(badge);

  const target = document.createElement('div');
  target.className = 'perm-card-target';
  target.textContent = extractTarget(req.toolName, req.input);

  const actions = document.createElement('div');
  actions.className = 'perm-card-actions';

  function decide(decision: PermissionDecision, label: string, badgeClass: string): void {
    card.classList.add('decided');
    badge.className = `perm-badge ${badgeClass}`;
    badge.textContent = label;
    window.electronAPI.decidePermission(req.id, decision);
  }

  const btnAllow = document.createElement('button');
  btnAllow.className = 'perm-btn allow';
  btnAllow.textContent = 'Allow';
  btnAllow.addEventListener('click', () => decide('allow', 'allowed', 'allowed'));

  const btnSession = document.createElement('button');
  btnSession.className = 'perm-btn session';
  btnSession.textContent = 'Session';
  btnSession.addEventListener('click', () => decide('allow-session', 'session', 'session'));

  const btnDeny = document.createElement('button');
  btnDeny.className = 'perm-btn deny';
  btnDeny.textContent = 'Deny';
  btnDeny.addEventListener('click', () => decide('deny', 'denied', 'denied'));

  actions.appendChild(btnAllow);
  actions.appendChild(btnSession);
  actions.appendChild(btnDeny);

  card.appendChild(header);
  card.appendChild(target);
  card.appendChild(actions);

  return card;
}

window.electronAPI.onPermissionRequest((req: PermissionRequest) => {
  showPermissionsSection();
  const card = createPermCard(req);
  permFeed.prepend(card);
});

// ── Cost & Context panels ─────────────────────────────────────────────────────

let totalCostUsd = 0;
let totalInputTokens = 0;
let totalOutputTokens = 0;
let totalCacheReadTokens = 0;
let totalCacheWriteTokens = 0;
let requestCount = 0;
const requestHistory: ApiRequestEvent[] = [];

const costTotalEl    = document.getElementById('cost-total') as HTMLElement;
const costSInput     = document.getElementById('cost-s-input') as HTMLElement;
const costSOutput    = document.getElementById('cost-s-output') as HTMLElement;
const costSCacheRead = document.getElementById('cost-s-cache-read') as HTMLElement;
const costSCacheWrite= document.getElementById('cost-s-cache-write') as HTMLElement;
const costSRequests  = document.getElementById('cost-s-requests') as HTMLElement;

// Popup
const costPopup      = document.getElementById('cost-breakdown-popup') as HTMLElement;
const costPopupList  = document.getElementById('cost-popup-list') as HTMLElement;
const costPopupClose = document.getElementById('cost-popup-close') as HTMLElement;
const costPopupBackdrop = document.getElementById('cost-popup-backdrop') as HTMLElement;
const costSummaryEl  = document.getElementById('cost-summary') as HTMLElement;

costSummaryEl.addEventListener('click', () => { costPopup.classList.remove('hidden'); });
costPopupClose.addEventListener('click', () => { costPopup.classList.add('hidden'); });
costPopupBackdrop.addEventListener('click', () => { costPopup.classList.add('hidden'); });
const ctxBar = document.getElementById('ctx-bar') as HTMLElement;
const ctxPct = document.getElementById('ctx-pct') as HTMLElement;
const ctxUsedLabel = document.getElementById('ctx-used-label') as HTMLElement;
const ctxInputEl = document.getElementById('ctx-input') as HTMLElement;
const ctxCacheReadEl = document.getElementById('ctx-cache-read') as HTMLElement;
const ctxCacheWriteEl = document.getElementById('ctx-cache-write') as HTMLElement;
const ctxOutputEl = document.getElementById('ctx-output') as HTMLElement;

function fmtCost(usd: number): string {
  if (usd < 0.0001) return '$0.0000';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(4)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtTokensFull(n: number): string {
  return n.toLocaleString();
}

function getContextWindow(model: string): number {
  // All current Claude models support 200k context
  void model;
  return 200_000;
}

function updateCostPanel(event: ApiRequestEvent): void {
  totalCostUsd       += event.costUsd;
  totalInputTokens   += event.inputTokens;
  totalOutputTokens  += event.outputTokens;
  totalCacheReadTokens  += event.cacheReadTokens;
  totalCacheWriteTokens += event.cacheWriteTokens;
  requestCount += 1;
  requestHistory.push(event);

  costTotalEl.textContent    = fmtCost(totalCostUsd);
  costSInput.textContent     = fmtTokensFull(totalInputTokens);
  costSOutput.textContent    = fmtTokensFull(totalOutputTokens);
  costSCacheRead.textContent = fmtTokensFull(totalCacheReadTokens);
  costSCacheWrite.textContent= fmtTokensFull(totalCacheWriteTokens);
  costSRequests.textContent  = String(requestCount);

  // Prepend to popup list
  const item = document.createElement('div');
  item.className = 'cost-popup-item';

  const timeEl = document.createElement('span');
  timeEl.className = 'cost-popup-time';
  timeEl.textContent = formatTime(event.timestamp);

  const modelEl = document.createElement('span');
  modelEl.className = 'cost-popup-model';
  modelEl.textContent = event.model || '—';

  const costEl = document.createElement('span');
  costEl.className = 'cost-popup-cost';
  costEl.textContent = fmtCost(event.costUsd);

  item.appendChild(timeEl);
  item.appendChild(modelEl);
  item.appendChild(costEl);
  costPopupList.prepend(item);
}

function updateContextPanel(event: ApiRequestEvent): void {
  const ctx = getContextWindow(event.model);
  const used = event.inputTokens + event.cacheReadTokens + event.cacheWriteTokens;
  const pct = Math.min(100, Math.round((used / ctx) * 100));

  ctxBar.style.width = `${pct}%`;
  ctxBar.className = 'ctx-bar-fill' + (pct >= 80 ? ' danger' : pct >= 60 ? ' warn' : '');
  ctxPct.textContent = `${pct}%`;
  ctxUsedLabel.textContent = `${fmtTokensFull(used)} / ${fmtTokensFull(ctx)}`;
  ctxInputEl.textContent = fmtTokensFull(event.inputTokens);
  ctxCacheReadEl.textContent = fmtTokensFull(event.cacheReadTokens);
  ctxCacheWriteEl.textContent = fmtTokensFull(event.cacheWriteTokens);
  ctxOutputEl.textContent = fmtTokensFull(event.outputTokens);
}

window.electronAPI.onApiRequest((event: ApiRequestEvent) => {
  updateCostPanel(event);
  updateContextPanel(event);
});

// ── Launch screen ─────────────────────────────────────────────────────────────

const launchScreen = document.getElementById('launch-screen') as HTMLElement;
const selectedDirDisplay = document.getElementById('selected-dir-display') as HTMLElement;
const recentFoldersList = document.getElementById('recent-folders-list') as HTMLUListElement;
const accentColorInput = document.getElementById('accent-color-input') as HTMLInputElement;
const btnPickFolder = document.getElementById('btn-pick-folder') as HTMLButtonElement;
const btnResetAccent = document.getElementById('btn-reset-accent') as HTMLButtonElement;
const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const extraArgsInput = document.getElementById('extra-args-input') as HTMLInputElement;
const optResume = document.getElementById('opt-resume') as HTMLInputElement;
const optContinue = document.getElementById('opt-continue') as HTMLInputElement;
const optModel = document.getElementById('opt-model') as HTMLSelectElement;
const optEffort = document.getElementById('opt-effort') as HTMLSelectElement;
const optPermissionMode = document.getElementById('opt-permission-mode') as HTMLSelectElement;

let selectedFolder: string | null = null;
let allFolderSettings: Record<string, FolderSettings> = {};

const titlebarText = document.getElementById('titlebar-text') as HTMLSpanElement;

function symbolColorFor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 0.5 ? '#000000' : '#ffffff';
}

function setAccentColor(color: string): void {
  accentColorInput.value = color;
  document.documentElement.style.setProperty('--accent-color', color);
  titlebarText.style.color = symbolColorFor(color);
  window.electronAPI.setWindowAccentColor(color);
}

function applySettings(settings: FolderSettings): void {
  setAccentColor(settings.accentColor ?? '#4ec94e');
  const opts = settings.launchOptions ?? {};
  optResume.checked = opts.resume ?? false;
  optContinue.checked = opts.continue ?? false;
  optModel.value = opts.model ?? '';
  optEffort.value = opts.effort ?? '';
  optPermissionMode.value = opts.permissionMode ?? '';
  extraArgsInput.value = opts.extraArgs ?? '';

  const layout = settings.panelLayout;
  if (layout) {
    const known = new Set(layout.order);
    sectionOrder = [...layout.order, ...ALL_SECTIONS.filter(s => !known.has(s))];
    hiddenSections.clear();
    for (const id of layout.hidden) hiddenSections.add(id);
  } else {
    sectionOrder = [...ALL_SECTIONS];
    hiddenSections.clear();
    for (const id of DEFAULT_HIDDEN) hiddenSections.add(id);
  }
  applyPanelState();
}

function selectFolder(folder: string): void {
  selectedFolder = folder;
  selectedDirDisplay.textContent = folder;
  selectedDirDisplay.classList.add('has-path');
  applySettings(allFolderSettings[folder] ?? {});
}

function renderRecentFolders(folders: string[]): void {
  recentFoldersList.innerHTML = '';
  for (const folder of folders) {
    const li = document.createElement('li');
    li.className = 'recent-folder-item';

    const dot = document.createElement('span');
    dot.className = 'recent-folder-dot';
    const accent = allFolderSettings[folder]?.accentColor;
    if (accent) dot.style.background = accent;

    const pathSpan = document.createElement('span');
    pathSpan.className = 'recent-folder-path';
    pathSpan.textContent = folder;
    pathSpan.title = folder;

    li.appendChild(dot);
    li.appendChild(pathSpan);
    li.addEventListener('click', () => selectFolder(folder));
    recentFoldersList.appendChild(li);
  }
}

function assembleArgs(): { args: string[]; cwd: string } {
  const args: string[] = [];
  if (optResume.checked) args.push('--resume');
  else if (optContinue.checked) args.push('--continue');
  if (optModel.value) args.push('--model', optModel.value);
  if (optEffort.value) args.push('--effort', optEffort.value);
  if (optPermissionMode.value) args.push('--permission-mode', optPermissionMode.value);
  const extra = extraArgsInput.value.trim();
  if (extra) args.push(...extra.split(/\s+/).filter(Boolean));
  return { args, cwd: selectedFolder ?? '' };
}

function launch(): void {
  const folderKey = selectedFolder ?? '';
  const launchOptions: LaunchOptions = {
    resume: optResume.checked || undefined,
    continue: optContinue.checked || undefined,
    model: optModel.value || undefined,
    effort: optEffort.value || undefined,
    permissionMode: optPermissionMode.value || undefined,
    extraArgs: extraArgsInput.value.trim() || undefined,
  };

  window.electronAPI.setLaunchOptions(folderKey, launchOptions);
  window.electronAPI.setAccentColor(folderKey, accentColorInput.value !== '#4ec94e'
    ? accentColorInput.value
    : undefined);

  const folderName = selectedFolder
    ? selectedFolder.split(/[\\/]/).filter(Boolean).pop() ?? selectedFolder
    : 'Gada Terminal';
  titlebarText.textContent = folderName;

  const { args, cwd } = assembleArgs();
  launchScreen.classList.add('hidden');

  requestAnimationFrame(() => {
    fitAddon.fit();
    window.electronAPI.sendResize(terminal.cols, terminal.rows);
    window.electronAPI.launchClaude(args, cwd);
  });
}

btnPickFolder.addEventListener('click', async () => {
  const folder = await window.electronAPI.pickFolder();
  if (folder) selectFolder(folder);
});

btnResetAccent.addEventListener('click', () => setAccentColor('#4ec94e'));
accentColorInput.addEventListener('input', () => setAccentColor(accentColorInput.value));

optResume.addEventListener('change', () => { if (optResume.checked) optContinue.checked = false; });
optContinue.addEventListener('change', () => { if (optContinue.checked) optResume.checked = false; });

btnStart.addEventListener('click', launch);
extraArgsInput.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') launch(); });

(async () => {
  const [recentFolders, initialArgs, settings] = await Promise.all([
    window.electronAPI.getRecentFolders(),
    window.electronAPI.getInitialArgs(),
    window.electronAPI.getAllFolderSettings(),
  ]);
  allFolderSettings = settings;
  if (initialArgs.length > 0) extraArgsInput.value = initialArgs.join(' ');
  renderRecentFolders(recentFolders);
  applySettings(allFolderSettings[''] ?? {});
})();
