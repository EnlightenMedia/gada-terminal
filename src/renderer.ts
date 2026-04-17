import '@xterm/xterm/css/xterm.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { LaunchOptions, FolderSettings, ToolEvent, ApiRequestEvent, WidgetDescriptor, WidgetCapabilityRequest } from './types';

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
  if (e.type !== 'keydown') return true;

  // Ctrl+V: paste text from clipboard
  if (e.ctrlKey && e.key === 'v') {
    window.electronAPI.readClipboard().then((text: string) => {
      if (text) terminal.paste(text);
    });
    return false;
  }

  // Ctrl+Shift+C: copy selected text (mirrors right-click copy)
  if (e.ctrlKey && e.shiftKey && e.key === 'C') {
    const selection = terminal.getSelection();
    if (selection) window.electronAPI.writeClipboard(selection);
    return false;
  }

  // Ctrl+Enter: send \n so Claude Code treats it as a soft newline (not submit)
  if (e.ctrlKey && e.key === 'Enter') {
    window.electronAPI.sendInput('\n');
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

// ── Sidebar resize ────────────────────────────────────────────────────────────

const panelLeft  = document.getElementById('panel-left')  as HTMLElement;
const panelRight = document.getElementById('panel-right') as HTMLElement;
const sidebarLeftResizeHandle  = document.getElementById('sidebar-left-resize-handle')  as HTMLElement;
const sidebarRightResizeHandle = document.getElementById('sidebar-right-resize-handle') as HTMLElement;
const panelLeftSections  = document.getElementById('panel-left-sections')  as HTMLElement;
const panelRightSections = document.getElementById('panel-right-sections') as HTMLElement;
const settingsPopup      = document.getElementById('settings-popup')      as HTMLElement;
const settingsPopupList  = document.getElementById('settings-popup-list') as HTMLElement;
const btnOpenWidgetMgmt  = document.getElementById('btn-open-widget-mgmt') as HTMLButtonElement;

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 700;
let sidebarRightSaveTimeout: ReturnType<typeof setTimeout> | null = null;
let sidebarLeftSaveTimeout:  ReturnType<typeof setTimeout> | null = null;

// Right sidebar: handle sits at left edge; drag left → wider
sidebarRightResizeHandle.addEventListener('mousedown', (e) => {
  e.preventDefault();
  sidebarRightResizeHandle.classList.add('dragging');
  const startX = e.clientX;
  const startWidth = panelRight.offsetWidth;

  function onMouseMove(mv: MouseEvent): void {
    const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, startWidth + (startX - mv.clientX)));
    panelRight.style.width = `${newWidth}px`;
  }

  function onMouseUp(): void {
    sidebarRightResizeHandle.classList.remove('dragging');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    const finalWidth = panelRight.offsetWidth;
    if (sidebarRightSaveTimeout) clearTimeout(sidebarRightSaveTimeout);
    sidebarRightSaveTimeout = setTimeout(() => {
      window.electronAPI.setSidebarWidth(selectedFolder ?? '', finalWidth);
    }, 300);
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
});

// Left sidebar: handle sits at right edge; drag right → wider
sidebarLeftResizeHandle.addEventListener('mousedown', (e) => {
  e.preventDefault();
  sidebarLeftResizeHandle.classList.add('dragging');
  const startX = e.clientX;
  const startWidth = panelLeft.offsetWidth;

  function onMouseMove(mv: MouseEvent): void {
    const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, startWidth + (mv.clientX - startX)));
    panelLeft.style.width = `${newWidth}px`;
  }

  function onMouseUp(): void {
    sidebarLeftResizeHandle.classList.remove('dragging');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    const finalWidth = panelLeft.offsetWidth;
    if (sidebarLeftSaveTimeout) clearTimeout(sidebarLeftSaveTimeout);
    sidebarLeftSaveTimeout = setTimeout(() => {
      window.electronAPI.setSidebarLeftWidth(selectedFolder ?? '', finalWidth);
    }, 300);
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
});

// ── Panel (sidebar) ───────────────────────────────────────────────────────────

const ALL_SECTIONS = ['tools', 'errors', 'permissions', 'cost', 'context'];
const DEFAULT_HIDDEN = new Set(['errors', 'permissions', 'cost', 'context']);

let sectionOrder: string[] = [...ALL_SECTIONS];
const hiddenSections: Set<string> = new Set(DEFAULT_HIDDEN);
const sectionSides = new Map<string, 'left' | 'right'>(); // absent = 'right'

// Widget panels
let allDescriptors: WidgetDescriptor[] = [];
const widgetSections: string[] = [];
const widgetIframes = new Map<string, { iframe: HTMLIFrameElement; permissions: string[]; capabilities: string[] }>();

interface ActiveDialog {
  reqId: string;
  widgetIframe: HTMLIFrameElement;
  overlay: HTMLElement;
  dialogIframe: HTMLIFrameElement;
}
let activeDialog: ActiveDialog | null = null;

const sectionNames = new Map<string, string>([
  ['tools',       'Tools'],
  ['errors',      'Errors'],
  ['permissions', 'Permissions'],
  ['cost',        'Cost'],
  ['context',     'Context'],
]);

function getSectionSide(id: string): 'left' | 'right' {
  return sectionSides.get(id) ?? 'right';
}

function updateSidebarVisibility(): void {
  const leftHasVisible  = sectionOrder.some(id => getSectionSide(id) === 'left'  && !hiddenSections.has(id));
  const rightHasVisible = sectionOrder.some(id => getSectionSide(id) === 'right' && !hiddenSections.has(id));

  panelLeft.classList.toggle('hidden', !leftHasVisible);
  sidebarLeftResizeHandle.classList.toggle('hidden', !leftHasVisible);
  panelRight.classList.toggle('hidden', !rightHasVisible);
  sidebarRightResizeHandle.classList.toggle('hidden', !rightHasVisible);

  fitAndResize();
}

function savePanelLayout(): void {
  const sides: Record<string, string> = {};
  for (const [id, side] of sectionSides) sides[id] = side;
  window.electronAPI.setPanelLayout(selectedFolder ?? '', {
    order: sectionOrder,
    hidden: [...hiddenSections],
    sides,
  });
}

function applyPanelState(): void {
  // Place each section in its correct sidebar container.
  // Use CSS order for same-container reordering to avoid moving iframe DOM nodes,
  // which would cause the iframe to reload and lose widget state.
  for (const [idx, id] of sectionOrder.entries()) {
    const el = document.getElementById(`section-${id}`);
    if (!el) continue;
    const target = getSectionSide(id) === 'left' ? panelLeftSections : panelRightSections;
    if (el.parentElement !== target) {
      target.appendChild(el); // cross-container move — necessary, iframe will reload
    } else {
      (el as HTMLElement).style.order = String(idx); // same container — reorder without DOM move
    }
  }
  // Apply hidden/visible
  for (const id of sectionOrder) {
    const el = document.getElementById(`section-${id}`);
    if (el) el.classList.toggle('hidden', hiddenSections.has(id));
  }
  updateSidebarVisibility();
  refreshSettingsPopup();
}

// Section drag-and-drop (reorder within same side, or move across sides)
let dragSectionId: string | null = null;

function wireSection(section: HTMLElement, id: string): void {
  section.addEventListener('dragstart', (e) => {
    dragSectionId = id;
    e.dataTransfer!.effectAllowed = 'move';
    document.body.classList.add('dragging-widget');
  });

  section.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragSectionId === id) return;
    section.classList.add('drag-target-above');
  });

  section.addEventListener('dragleave', () => {
    section.classList.remove('drag-target-above');
  });

  section.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    section.classList.remove('drag-target-above');
    if (!dragSectionId || dragSectionId === id) return;

    // Move dragged section to the same side as the target
    sectionSides.set(dragSectionId, getSectionSide(id));

    const fromIdx = sectionOrder.indexOf(dragSectionId);
    const toIdx   = sectionOrder.indexOf(id);
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
    document.body.classList.remove('dragging-widget');
    dragSectionId = null;
  });
}

// Allow dropping onto a sidebar container (e.g. into empty panel)
function wireSidebarContainer(containerEl: HTMLElement, side: 'left' | 'right'): void {
  containerEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    containerEl.classList.add('drag-target-sidebar');
  });

  containerEl.addEventListener('dragleave', (e) => {
    if (!containerEl.contains(e.relatedTarget as Node)) {
      containerEl.classList.remove('drag-target-sidebar');
    }
  });

  containerEl.addEventListener('drop', (e) => {
    e.preventDefault();
    containerEl.classList.remove('drag-target-sidebar');
    if (!dragSectionId) return;
    sectionSides.set(dragSectionId, side);
    applyPanelState();
    savePanelLayout();
    dragSectionId = null;
  });
}

// Wire built-in sections
document.querySelectorAll<HTMLElement>('.panel-section').forEach(section => {
  wireSection(section, section.dataset.sectionId!);
});

wireSidebarContainer(panelLeftSections, 'left');
wireSidebarContainer(panelRightSections, 'right');

applyPanelState();

// ── Widget panels ────────────────────────────────────────────────────────────

function buildSrcdoc(desc: WidgetDescriptor): string {
  const escaped = desc.entrySource.replace(/<\/script/gi, '<\\/script');
  const shim = `(function(){
  var _l={},_p={};
  function _req(capability,args){
    return new Promise(function(resolve,reject){
      var reqId=Math.random().toString(36).slice(2)+Date.now();
      _p[reqId]={resolve:resolve,reject:reject};
      window.parent.postMessage({type:'widget:capability-request',capability:capability,args:args,reqId:reqId},'*');
    });
  }
  window.WidgetAPI={
    version:'1',
    on:function(t,cb){if(!_l[t])_l[t]=[];_l[t].push(cb);},
    getTheme:function(){return{background:'#181818',backgroundSecondary:'#212121',textPrimary:'#e0e0e0',textMuted:'#666',accent:'#4ec94e',fontUi:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",fontMono:"'Cascadia Code',Consolas,monospace"};},
    setTitle:function(t){window.parent.postMessage({type:'panel:setTitle',title:t},'*');},
    setHeight:function(px){window.parent.postMessage({type:'panel:setHeight',height:px},'*');},
    emit:function(eventType,payload){window.parent.postMessage({type:'widget:emit',eventType:eventType,payload:payload},'*');},
    sendTerminalInput:function(text){return _req('terminal:write',[text]);},
    sendClaudeMessage:function(text){return _req('claude:message',[text]);},
    spawnProcess:function(cmd,args){return _req('process:spawn',[cmd,args||[]]);},
    httpRequest:function(url,opts){return _req('http:request',[url,opts||{}]);},
    shellLaunch:function(opts){return _req('shell:launch',[opts||{}]);},
    openDialog:function(script,opts){return new Promise(function(res,rej){var reqId=Math.random().toString(36).slice(2)+Date.now();_p[reqId]={resolve:res,reject:rej};window.parent.postMessage({type:'widget:dialog-open',script:script,reqId:reqId,opts:opts||{}},'*');});},
    getContext:function(){return new Promise(function(res,rej){var reqId=Math.random().toString(36).slice(2)+Date.now();_p[reqId]={resolve:res,reject:rej};window.parent.postMessage({type:'widget:context-request',reqId:reqId},'*');});},
    storage:{
      get:function(key){return new Promise(function(res,rej){var reqId=Math.random().toString(36).slice(2)+Date.now();_p[reqId]={resolve:res,reject:rej};window.parent.postMessage({type:'widget:storage-get',key:key,reqId:reqId},'*');});},
      set:function(key,value){return new Promise(function(res,rej){var reqId=Math.random().toString(36).slice(2)+Date.now();_p[reqId]={resolve:res,reject:rej};window.parent.postMessage({type:'widget:storage-set',key:key,value:value,reqId:reqId},'*');});}
    },
  };
  window.addEventListener('message',function(e){
    if(!e.data||!e.data.type)return;
    var t=String(e.data.type);
    if(t==='widget:capability-response'){
      var entry=_p[e.data.reqId];
      if(!entry)return;
      delete _p[e.data.reqId];
      if(e.data.ok){entry.resolve(e.data.result);}
      else{entry.reject(new Error(e.data.error||'Capability denied'));}
      return;
    }
    if(t==='widget:context-response'){
      var ctxEntry=_p[e.data.reqId];
      if(!ctxEntry)return;
      delete _p[e.data.reqId];
      ctxEntry.resolve(e.data.cwd);
      return;
    }
    if(t==='widget:storage-response'){
      var stEntry=_p[e.data.reqId];
      if(!stEntry)return;
      delete _p[e.data.reqId];
      stEntry.resolve(e.data.value);
      return;
    }
    if(t==='widget:dialog-response'){
      var dlgEntry=_p[e.data.reqId];
      if(!dlgEntry)return;
      delete _p[e.data.reqId];
      dlgEntry.resolve(e.data.result);
      return;
    }
    if(t.indexOf('event:')===0){
      var et=t.slice(6),cbs=_l[et]||[];
      for(var i=0;i<cbs.length;i++){try{cbs[i](e.data.payload);}catch(err){console.error('[Widget${desc.id}]',err);}}
    }
  });
})();`;

  return [
    '<!DOCTYPE html><html><head><meta charset="UTF-8">',
    '<style>',
    '*{box-sizing:border-box;margin:0;padding:0;}',
    'body{background:#181818;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:12px;padding:6px;overflow-y:auto;}',
    '::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#444;border-radius:3px;}',
    '</style></head><body>',
    '<script>', shim, '</script>',
    '<script>', escaped, '</script>',
    '</body></html>',
  ].join('\n');
}

function buildDialogSrcdoc(script: string): string {
  const escaped = script.replace(/<\/script/gi, '<\\/script');
  const shim = `(function(){
  window.DialogAPI={
    getTheme:function(){return{background:'#181818',backgroundSecondary:'#212121',textPrimary:'#e0e0e0',textMuted:'#666',accent:'#4ec94e',fontUi:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",fontMono:"'Cascadia Code',Consolas,monospace"};},
    close:function(result){window.parent.postMessage({type:'dialog:close',result:result},'*');}
  };
})();`;
  return [
    '<!DOCTYPE html><html><head><meta charset="UTF-8">',
    '<style>',
    '*{box-sizing:border-box;margin:0;padding:0;}',
    'body{background:#1c1c1c;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:12px;padding:12px;overflow-y:auto;}',
    '::-webkit-scrollbar{width:6px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:#444;border-radius:3px;}',
    '</style></head><body>',
    '<script>', shim, '</script>',
    '<script>', escaped, '</script>',
    '</body></html>',
  ].join('\n');
}

function openWidgetDialog(reqId: string, script: string, widgetIframe: HTMLIFrameElement, opts: Record<string, unknown> = {}): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);';

  const w = typeof opts['width'] === 'number' ? `${opts['width']}px` : '520px';
  const h = typeof opts['height'] === 'number' ? `${opts['height']}px` : '70vh';
  const maxH = typeof opts['height'] === 'number' ? `${opts['height']}px` : '600px';
  const box = document.createElement('div');
  box.style.cssText = `width:${w};max-width:90vw;height:${h};max-height:${maxH};background:#1c1c1c;border:1px solid #303030;border-radius:6px;overflow:hidden;display:flex;flex-direction:column;`;

  const dialogIframe = document.createElement('iframe');
  dialogIframe.setAttribute('sandbox', 'allow-scripts');
  dialogIframe.style.cssText = 'width:100%;flex:1;border:none;display:block;background:#1c1c1c;';
  dialogIframe.srcdoc = buildDialogSrcdoc(script);
  box.appendChild(dialogIframe);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  activeDialog = { reqId, widgetIframe, overlay, dialogIframe };

  overlay.addEventListener('click', (e: MouseEvent) => {
    if (e.target === overlay) closeWidgetDialog(null);
  });
}

function closeWidgetDialog(result: unknown): void {
  if (!activeDialog) return;
  const { reqId, widgetIframe, overlay } = activeDialog;
  activeDialog = null;
  overlay.remove();
  widgetIframe.contentWindow?.postMessage({ type: 'widget:dialog-response', reqId, result }, '*');
}

// Route dialog:close from the active dialog iframe back to the originating widget
window.addEventListener('message', (e: MessageEvent) => {
  if (!activeDialog || e.source !== activeDialog.dialogIframe.contentWindow) return;
  if (!e.data || e.data.type !== 'dialog:close') return;
  closeWidgetDialog('result' in e.data ? e.data.result : null);
});

function createWidgetPanels(descriptors: WidgetDescriptor[]): void {
  if (descriptors.length === 0) return;

  const newIds: string[] = [];

  for (const desc of descriptors) {
    widgetSections.push(desc.id);
    newIds.push(desc.id);
    sectionNames.set(desc.id, desc.name);

    // Section element (defaults to right panel; applyPanelState will place it correctly)
    const section = document.createElement('div');
    section.className = 'panel-section';
    section.id = `section-${desc.id}`;
    section.dataset.sectionId = desc.id;
    section.draggable = true;
    wireSection(section, desc.id);

    const header = document.createElement('div');
    header.className = 'panel-section-header';
    const title = document.createElement('span');
    title.className = 'panel-section-title';
    title.textContent = desc.name;
    header.appendChild(title);
    section.appendChild(header);

    const body = document.createElement('div');
    body.className = 'panel-section-body';
    body.style.cssText = 'padding:0;overflow:hidden;';

    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#181818;';
    iframe.srcdoc = buildSrcdoc(desc);
    body.appendChild(iframe);
    section.appendChild(body);
    panelRightSections.appendChild(section);

    widgetIframes.set(desc.id, { iframe, permissions: desc.permissions, capabilities: desc.capabilities });

    // Handle postMessages from this widget
    window.addEventListener('message', (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      if (!e.data || !e.data.type) return;
      const msgType: string = e.data.type;
      if (msgType === 'panel:setTitle') {
        title.textContent = String(e.data.title ?? desc.name);
      } else if (msgType === 'panel:setHeight' && typeof e.data.height === 'number') {
        iframe.style.height = `${e.data.height}px`;
      } else if (msgType === 'widget:emit') {
        // Broadcast to all other widget iframes
        for (const [otherId, { iframe: other }] of widgetIframes) {
          if (otherId !== desc.id) {
            other.contentWindow?.postMessage({
              type: `event:${e.data.eventType}`,
              payload: e.data.payload,
            }, '*');
          }
        }
      } else if (msgType === 'widget:capability-request') {
        const reqId: string = e.data.reqId;
        const capability: string = e.data.capability;
        const args: unknown[] = Array.isArray(e.data.args) ? e.data.args : [];
        window.electronAPI.widgetCapabilityRequest(desc.id, capability, args).then(result => {
          iframe.contentWindow?.postMessage({ type: 'widget:capability-response', reqId, ...result }, '*');
        });
      } else if (msgType === 'widget:context-request') {
        iframe.contentWindow?.postMessage({
          type: 'widget:context-response',
          reqId: e.data.reqId,
          cwd: selectedFolder ?? '',
        }, '*');
      } else if (msgType === 'widget:storage-get') {
        const storeKey = `widget-storage:${desc.id}`;
        const store: Record<string, string> = JSON.parse(localStorage.getItem(storeKey) ?? '{}');
        iframe.contentWindow?.postMessage({
          type: 'widget:storage-response',
          reqId: e.data.reqId,
          value: store[String(e.data.key ?? '')] ?? null,
        }, '*');
      } else if (msgType === 'widget:storage-set') {
        const storeKey = `widget-storage:${desc.id}`;
        const store: Record<string, string> = JSON.parse(localStorage.getItem(storeKey) ?? '{}');
        store[String(e.data.key ?? '')] = String(e.data.value ?? '');
        localStorage.setItem(storeKey, JSON.stringify(store));
        iframe.contentWindow?.postMessage({
          type: 'widget:storage-response',
          reqId: e.data.reqId,
          value: null,
        }, '*');
      } else if (msgType === 'widget:dialog-open') {
        if (activeDialog) return; // one dialog at a time
        const reqId = String(e.data.reqId ?? '');
        const script = typeof e.data.script === 'string' ? e.data.script : '';
        const opts = e.data.opts && typeof e.data.opts === 'object' ? e.data.opts : {};
        if (reqId && script) openWidgetDialog(reqId, script, iframe, opts);
      }
    });
  }

  sectionOrder = [...sectionOrder, ...newIds];
}

function forwardToWidgets(eventType: string, payload: unknown): void {
  for (const [, { iframe, permissions }] of widgetIframes) {
    if (permissions.includes(eventType)) {
      iframe.contentWindow?.postMessage({ type: `event:${eventType}`, payload }, '*');
    }
  }
}

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
const toolHistoryPopup = document.getElementById('tool-history-popup') as HTMLElement;
const toolPopupList = document.getElementById('tool-popup-list') as HTMLElement;
const toolPopupClose = document.getElementById('tool-popup-close') as HTMLElement;
const toolPopupBackdrop = document.getElementById('tool-popup-backdrop') as HTMLElement;
const btnToolHistory = document.getElementById('btn-tool-history') as HTMLButtonElement;

btnToolHistory.addEventListener('click', () => toolHistoryPopup.classList.remove('hidden'));
toolPopupClose.addEventListener('click', () => toolHistoryPopup.classList.add('hidden'));
toolPopupBackdrop.addEventListener('click', () => toolHistoryPopup.classList.add('hidden'));

const MAX_LIVE_TOOLS = 3;
const liveFeedCards: HTMLElement[] = []; // ordered newest-first, mirrors toolsFeed DOM

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
    liveFeedCards.unshift(card);

    // Evict oldest card to history popup when live feed exceeds limit
    while (liveFeedCards.length > MAX_LIVE_TOOLS) {
      const oldest = liveFeedCards.pop()!;
      oldest.remove();
      toolPopupList.prepend(oldest);
    }
  } else {
    let card = toolCardMap.get(event.id);
    if (!card) {
      // No PreToolUse card exists — create one now and add it to the feed
      card = createToolCard(event);
      toolCardMap.set(event.id, card);
      toolsFeed.prepend(card);
      liveFeedCards.unshift(card);
      while (liveFeedCards.length > MAX_LIVE_TOOLS) {
        const oldest = liveFeedCards.pop()!;
        oldest.remove();
        toolPopupList.prepend(oldest);
      }
    }
    updateToolCard(card, event);

    if (event.event === 'PostToolUseFailure') {
      const errCard = createErrorCard(event);
      errorsFeed.prepend(errCard);
      liveErrorCards.unshift(errCard);

      while (liveErrorCards.length > MAX_LIVE_ERRORS) {
        const oldest = liveErrorCards.pop()!;
        oldest.remove();
        errorPopupList.prepend(oldest);
      }
    }
  }
  forwardToWidgets('hook:tool-event', event);
});

// ── Error log ─────────────────────────────────────────────────────────────────

const errorsFeed          = document.getElementById('errors-feed')          as HTMLElement;
const errorHistoryPopup   = document.getElementById('error-history-popup')  as HTMLElement;
const errorPopupList      = document.getElementById('error-popup-list')     as HTMLElement;
const errorPopupClose     = document.getElementById('error-popup-close')    as HTMLElement;
const errorPopupBackdrop  = document.getElementById('error-popup-backdrop') as HTMLElement;
const btnErrorHistory     = document.getElementById('btn-error-history')    as HTMLButtonElement;

btnErrorHistory.addEventListener('click', () => errorHistoryPopup.classList.remove('hidden'));
errorPopupClose.addEventListener('click', () => errorHistoryPopup.classList.add('hidden'));
errorPopupBackdrop.addEventListener('click', () => errorHistoryPopup.classList.add('hidden'));

const MAX_LIVE_ERRORS = 3;
const liveErrorCards: HTMLElement[] = []; // ordered newest-first, mirrors errorsFeed DOM

function createErrorCard(event: ToolEvent): HTMLElement {
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
  badge.className = 'tool-badge failed';
  badge.textContent = 'failed';

  header.appendChild(time);
  header.appendChild(name);
  header.appendChild(badge);

  const target = document.createElement('div');
  target.className = 'tool-card-target';
  target.textContent = event.error ?? '(no error message)';

  const details = document.createElement('div');
  details.className = 'tool-card-details';
  details.textContent = JSON.stringify(event.input, null, 2)
    + (event.error ? `\n\n--- Error ---\n${event.error}` : '');

  card.appendChild(header);
  card.appendChild(target);
  card.appendChild(details);

  card.addEventListener('click', () => card.classList.toggle('expanded'));

  return card;
}

// ── Permission cards ──────────────────────────────────────────────────────────

const permFeed = document.getElementById('permissions-feed') as HTMLElement;
const permHistoryPopup = document.getElementById('perm-history-popup') as HTMLElement;
const permPopupList = document.getElementById('perm-popup-list') as HTMLElement;
const permPopupClose = document.getElementById('perm-popup-close') as HTMLElement;
const permPopupBackdrop = document.getElementById('perm-popup-backdrop') as HTMLElement;
const btnPermHistory = document.getElementById('btn-perm-history') as HTMLButtonElement;

btnPermHistory.addEventListener('click', () => permHistoryPopup.classList.remove('hidden'));
permPopupClose.addEventListener('click', () => permHistoryPopup.classList.add('hidden'));
permPopupBackdrop.addEventListener('click', () => permHistoryPopup.classList.add('hidden'));

function showPermissionsSection(): void {
  if (!hiddenSections.has('permissions')) return;
  hiddenSections.delete('permissions');
  applyPanelState();
}

function hidePermissionsSectionIfEmpty(): void {
  if (permFeed.children.length === 0 && !hiddenSections.has('permissions')) {
    hiddenSections.add('permissions');
    applyPanelState();
  }
}

function addPermHistory(req: { toolName: string; input: Record<string, unknown>; timestamp: number }, label: string, badgeClass: string): void {
  const item = document.createElement('div');
  item.className = 'perm-popup-item';

  const row = document.createElement('div');
  row.className = 'perm-popup-item-row';

  const timeEl = document.createElement('span');
  timeEl.className = 'perm-popup-time';
  timeEl.textContent = formatTime(req.timestamp);

  const nameEl = document.createElement('span');
  nameEl.className = 'perm-popup-tool';
  nameEl.textContent = req.toolName;

  const badge = document.createElement('span');
  badge.className = `perm-badge ${badgeClass}`;
  badge.textContent = label;

  row.appendChild(timeEl);
  row.appendChild(nameEl);
  row.appendChild(badge);

  const targetEl = document.createElement('div');
  targetEl.className = 'perm-popup-target';
  targetEl.textContent = Object.entries(req.input).map(([k, v]) => {
    let s = typeof v === 'string' ? v.replace(/\\n/g, ' ').replace(/\\t/g, ' ') : JSON.stringify(v);
    if (s.length > 50) s = s.slice(0, 50) + '…';
    return `${k}: ${s}`;
  }).join('  ·  ');

  item.appendChild(row);
  item.appendChild(targetEl);
  permPopupList.prepend(item);
}

// ── Widget capability approval cards ─────────────────────────────────────────

const CAPABILITY_LABELS: Record<string, string> = {
  'terminal:write': 'Write to terminal',
  'claude:message': 'Send Claude a message',
  'process:spawn': 'Spawn a process',
  'http:request': 'Make HTTP requests',
  'shell:launch': 'Open a terminal window',
};

function createWidgetCapabilityCard(req: WidgetCapabilityRequest): HTMLElement {
  const card = document.createElement('div');
  card.className = 'perm-card';

  const header = document.createElement('div');
  header.className = 'perm-card-header';

  const time = document.createElement('span');
  time.className = 'perm-card-time';
  time.textContent = formatTime(req.timestamp);

  const name = document.createElement('span');
  name.className = 'perm-card-name';
  name.textContent = req.widgetName;

  const badge = document.createElement('span');
  badge.className = 'perm-badge pending';
  badge.textContent = 'widget';

  header.appendChild(time);
  header.appendChild(name);
  header.appendChild(badge);

  const detail = document.createElement('pre');
  detail.className = 'perm-card-input';
  detail.textContent = `Requesting: ${CAPABILITY_LABELS[req.capability] ?? req.capability}`;

  const actions = document.createElement('div');
  actions.className = 'perm-card-actions';

  function decide(decision: 'allow' | 'allow-session' | 'deny', label: string, badgeClass: string): void {
    card.remove();
    hidePermissionsSectionIfEmpty();
    addPermHistory(
      { toolName: `${req.widgetName} · ${req.capability}`, input: {}, timestamp: req.timestamp },
      label,
      badgeClass
    );
    window.electronAPI.widgetCapabilityDecide(req.id, decision);
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
  card.appendChild(detail);
  card.appendChild(actions);

  return card;
}

window.electronAPI.onWidgetCapabilityRequest((req: WidgetCapabilityRequest) => {
  showPermissionsSection();
  const card = createWidgetCapabilityCard(req);
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

let launchedModel = '';

// Models (or prefixes) known to have a 1M token context window.
// Claude Opus 4.x ships with 1M context by default; the [1m] suffix is just
// a Claude Code display alias and does not appear in OTLP model IDs.
const MODELS_1M = [
  'claude-opus-4',   // covers claude-opus-4-5, claude-opus-4-6, future 4.x
];

function getContextWindow(model: string): number {
  const check = (m: string) =>
    m.includes('[1m]') || MODELS_1M.some(prefix => m.includes(prefix));

  if (check(model)) return 1_000_000;
  // Fall back to the model entered at launch time in case OTLP still reports
  // the same base model but without the [1m] display alias.
  if (launchedModel && check(launchedModel)) {
    const launchBase = launchedModel.replace(/\[.*$/, '');
    if (model.includes(launchBase)) return 1_000_000;
  }
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
  forwardToWidgets('hook:api-request', event);
});

// ── Widget management overlay ─────────────────────────────────────────────────

const widgetMgmtOverlay  = document.getElementById('widget-mgmt-overlay')  as HTMLElement;
const widgetMgmtList     = document.getElementById('widget-mgmt-list')     as HTMLElement;
const widgetMgmtBackdrop = document.getElementById('widget-mgmt-backdrop') as HTMLElement;
const btnWidgetMgmtClose = document.getElementById('btn-widget-mgmt-close') as HTMLButtonElement;

const CAPABILITY_LABELS_MGMT: Record<string, string> = {
  'terminal:write': 'terminal:write',
  'claude:message': 'claude:message',
  'process:spawn': 'process:spawn',
  'http:request': 'http:request',
  'shell:launch': 'shell:launch',
};

async function openWidgetMgmt(): Promise<void> {
  if (selectedFolder) {
    allFolderSettings[selectedFolder] = await window.electronAPI.getFolderSettings(selectedFolder);
  }
  renderWidgetMgmt();
  widgetMgmtOverlay.classList.remove('hidden');
}

function closeWidgetMgmt(): void {
  widgetMgmtOverlay.classList.add('hidden');
}

function renderWidgetMgmt(): void {
  widgetMgmtList.innerHTML = '';

  if (allDescriptors.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'widget-mgmt-empty';
    empty.textContent = 'No widgets installed.';
    widgetMgmtList.appendChild(empty);
    return;
  }

  const folderKey = selectedFolder ?? '';
  const folderSettings = allFolderSettings[folderKey] ?? {};
  const disabledSet = new Set(folderSettings.disabledWidgets ?? []);
  const grants = folderSettings.widgetGrants ?? {};

  for (const desc of allDescriptors) {
    const isDisabled = disabledSet.has(desc.id);

    const row = document.createElement('div');
    row.className = 'widget-mgmt-row' + (isDisabled ? ' disabled' : '');

    // Header: name, version, toggle
    const header = document.createElement('div');
    header.className = 'widget-mgmt-row-header';

    const nameEl = document.createElement('span');
    nameEl.className = 'widget-mgmt-name';
    nameEl.textContent = desc.name;

    const versionEl = document.createElement('span');
    versionEl.className = 'widget-mgmt-version';
    versionEl.textContent = `v${desc.version}`;

    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'widget-toggle';
    toggleLabel.title = isDisabled ? 'Enable widget' : 'Disable widget';

    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = !isDisabled;

    const toggleSlider = document.createElement('span');
    toggleSlider.className = 'widget-toggle-slider';
    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(toggleSlider);

    toggleInput.addEventListener('change', () => {
      const nowDisabled = !toggleInput.checked;
      row.classList.toggle('disabled', nowDisabled);
      toggleLabel.title = nowDisabled ? 'Enable widget' : 'Disable widget';

      // Persist
      const current = new Set(allFolderSettings[folderKey]?.disabledWidgets ?? []);
      if (nowDisabled) current.add(desc.id);
      else current.delete(desc.id);
      if (!allFolderSettings[folderKey]) allFolderSettings[folderKey] = {};
      allFolderSettings[folderKey].disabledWidgets = [...current];
      window.electronAPI.setWidgetDisabled(desc.id, nowDisabled);

      if (nowDisabled && widgetIframes.has(desc.id)) {
        // Remove panel from DOM immediately
        document.getElementById(`section-${desc.id}`)?.remove();
        const idx = sectionOrder.indexOf(desc.id);
        if (idx >= 0) sectionOrder.splice(idx, 1);
        const pIdx = widgetSections.indexOf(desc.id);
        if (pIdx >= 0) widgetSections.splice(pIdx, 1);
        sectionSides.delete(desc.id);
        sectionNames.delete(desc.id);
        widgetIframes.delete(desc.id);
        savePanelLayout();
        updateSidebarVisibility();
        refreshSettingsPopup();
      } else if (!nowDisabled && !widgetIframes.has(desc.id)) {
        // Re-enable: inject panel immediately
        createWidgetPanels([desc]);
        applyPanelState();
      }
    });

    header.appendChild(nameEl);
    header.appendChild(versionEl);
    if (desc.os && desc.os.length > 0) {
      const OS_DISPLAY: Record<string, string> = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
      const osBadge = document.createElement('span');
      osBadge.className = 'widget-os-badge';
      osBadge.textContent = desc.os.map(p => OS_DISPLAY[p] ?? p).join(', ');
      osBadge.title = `Platform-restricted: ${desc.os.join(', ')}`;
      header.appendChild(osBadge);
    }
    header.appendChild(toggleLabel);
    row.appendChild(header);

    // Granted capabilities
    const widgetGrants = grants[desc.id] ?? [];
    if (widgetGrants.length > 0) {
      const grantsEl = document.createElement('div');
      grantsEl.className = 'widget-grants';

      const grantsLabel = document.createElement('div');
      grantsLabel.className = 'widget-grants-label';
      grantsLabel.textContent = 'Granted';
      grantsEl.appendChild(grantsLabel);

      for (const cap of widgetGrants) {
        const grantRow = document.createElement('div');
        grantRow.className = 'widget-grant-row';

        const capLabel = document.createElement('span');
        capLabel.className = 'widget-grant-cap';
        capLabel.textContent = CAPABILITY_LABELS_MGMT[cap] ?? cap;

        const revokeBtn = document.createElement('button');
        revokeBtn.className = 'widget-grant-revoke';
        revokeBtn.textContent = 'Revoke';
        revokeBtn.addEventListener('click', () => {
          window.electronAPI.revokeWidgetGrant(desc.id, cap);
          const g = allFolderSettings[folderKey]?.widgetGrants ?? {};
          if (g[desc.id]) {
            g[desc.id] = g[desc.id].filter(c => c !== cap);
            if (g[desc.id].length === 0) delete g[desc.id];
          }
          if (allFolderSettings[folderKey]) allFolderSettings[folderKey].widgetGrants = g;
          grantRow.remove();
          if (grantsEl.querySelectorAll('.widget-grant-row').length === 0) grantsEl.remove();
        });

        grantRow.appendChild(capLabel);
        grantRow.appendChild(revokeBtn);
        grantsEl.appendChild(grantRow);
      }

      row.appendChild(grantsEl);
    }

    widgetMgmtList.appendChild(row);
  }
}

btnWidgetMgmtClose.addEventListener('click', closeWidgetMgmt);
widgetMgmtBackdrop.addEventListener('click', closeWidgetMgmt);

// ── Settings popup ────────────────────────────────────────────────────────────

function openSettingsPopup(anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  // Position below the anchor, aligned to whichever side it's on
  settingsPopup.style.top = `${rect.bottom + 4}px`;
  if (rect.left < window.innerWidth / 2) {
    settingsPopup.style.left = `${rect.left}px`;
    settingsPopup.style.right = 'auto';
  } else {
    settingsPopup.style.right = `${window.innerWidth - rect.right}px`;
    settingsPopup.style.left = 'auto';
  }
  settingsPopup.classList.remove('hidden');
  document.querySelectorAll('.btn-sidebar-settings').forEach(b => b.classList.add('active'));
  refreshSettingsPopup();
}

function closeSettingsPopup(): void {
  settingsPopup.classList.add('hidden');
  document.querySelectorAll('.btn-sidebar-settings').forEach(b => b.classList.remove('active'));
}

function refreshSettingsPopup(): void {
  if (settingsPopup.classList.contains('hidden')) return;
  settingsPopupList.innerHTML = '';

  for (const id of sectionOrder) {
    if (id === 'permissions') continue; // auto-managed; not user-toggleable
    const name = sectionNames.get(id) ?? id;
    const isHidden = hiddenSections.has(id);

    const rowEl = document.createElement('div');
    rowEl.className = 'settings-popup-row' + (isHidden ? ' hidden-section' : '');

    const nameEl = document.createElement('span');
    nameEl.className = 'settings-popup-name';
    nameEl.textContent = name;

    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'widget-toggle';
    toggleLabel.title = isHidden ? 'Show' : 'Hide';

    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = !isHidden;

    const toggleSlider = document.createElement('span');
    toggleSlider.className = 'widget-toggle-slider';
    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(toggleSlider);

    toggleInput.addEventListener('change', () => {
      if (hiddenSections.has(id)) hiddenSections.delete(id);
      else hiddenSections.add(id);
      rowEl.classList.toggle('hidden-section', hiddenSections.has(id));
      applyPanelState();
      savePanelLayout();
    });

    rowEl.appendChild(nameEl);
    rowEl.appendChild(toggleLabel);
    settingsPopupList.appendChild(rowEl);
  }
}

document.querySelectorAll<HTMLButtonElement>('.btn-sidebar-settings').forEach(btn => {
  btn.addEventListener('click', () => {
    if (settingsPopup.classList.contains('hidden')) openSettingsPopup(btn);
    else closeSettingsPopup();
  });
});

btnOpenWidgetMgmt.addEventListener('click', () => {
  closeSettingsPopup();
  void openWidgetMgmt();
});

document.addEventListener('mousedown', (e: MouseEvent) => {
  if (!settingsPopup.classList.contains('hidden') &&
      !settingsPopup.contains(e.target as Node) &&
      !(e.target as HTMLElement).closest('.btn-sidebar-settings')) {
    closeSettingsPopup();
  }
});

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') closeSettingsPopup();
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
let selectedPluginDirs: string[] = [];
let recentPluginDirs: string[] = [];

const btnBrowsePlugin = document.getElementById('btn-browse-plugin') as HTMLButtonElement;
const selectedPluginsEl = document.getElementById('selected-plugins') as HTMLDivElement;
const recentPluginsList = document.getElementById('recent-plugins-list') as HTMLUListElement;

function renderPluginChips(): void {
  selectedPluginsEl.innerHTML = '';
  for (const dir of selectedPluginDirs) {
    const chip = document.createElement('div');
    chip.className = 'plugin-chip';

    const pathEl = document.createElement('span');
    pathEl.className = 'plugin-chip-path';
    pathEl.textContent = dir;
    pathEl.title = dir;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'plugin-chip-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      selectedPluginDirs = selectedPluginDirs.filter(d => d !== dir);
      renderPluginChips();
      renderRecentPlugins();
    });

    chip.appendChild(pathEl);
    chip.appendChild(removeBtn);
    selectedPluginsEl.appendChild(chip);
  }
}

function renderRecentPlugins(): void {
  recentPluginsList.innerHTML = '';
  const unselected = recentPluginDirs.filter(d => !selectedPluginDirs.includes(d));
  for (const dir of unselected) {
    const li = document.createElement('li');
    li.className = 'recent-plugin-item';
    li.textContent = dir;
    li.title = dir;
    li.addEventListener('click', () => {
      if (!selectedPluginDirs.includes(dir)) {
        selectedPluginDirs.push(dir);
        renderPluginChips();
        renderRecentPlugins();
      }
    });
    recentPluginsList.appendChild(li);
  }
}

btnBrowsePlugin.addEventListener('click', async () => {
  const dir = await window.electronAPI.pickPluginDir();
  if (dir && !selectedPluginDirs.includes(dir)) {
    selectedPluginDirs.push(dir);
    renderPluginChips();
    renderRecentPlugins();
  }
});

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
  selectedPluginDirs = opts.pluginDirs ? [...opts.pluginDirs] : [];
  renderPluginChips();

  if (settings.sidebarWidth)     panelRight.style.width = `${settings.sidebarWidth}px`;
  if (settings.sidebarLeftWidth) panelLeft.style.width  = `${settings.sidebarLeftWidth}px`;

  const layout = settings.panelLayout;
  const allSectionIds = [...ALL_SECTIONS, ...widgetSections];
  if (layout) {
    const known = new Set(layout.order);
    sectionOrder = [...layout.order, ...allSectionIds.filter(s => !known.has(s))];
    hiddenSections.clear();
    for (const id of layout.hidden) hiddenSections.add(id);
    hiddenSections.add('permissions'); // always start hidden; auto-shows on capability request
    // Load side assignments
    sectionSides.clear();
    if (layout.sides) {
      for (const [id, side] of Object.entries(layout.sides)) {
        if (side === 'left' || side === 'right') sectionSides.set(id, side as 'left' | 'right');
      }
    }
  } else {
    sectionOrder = [...allSectionIds];
    hiddenSections.clear();
    for (const id of DEFAULT_HIDDEN) hiddenSections.add(id);
    sectionSides.clear();
  }
  applyPanelState();
}

function selectFolder(folder: string): void {
  selectedFolder = folder;
  selectedDirDisplay.textContent = folder;
  selectedDirDisplay.classList.add('has-path');
  applySettings(allFolderSettings[folder] ?? {});
  window.electronAPI.getRecentPlugins().then(dirs => { recentPluginDirs = dirs; renderRecentPlugins(); });
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
  for (const dir of selectedPluginDirs) args.push('--plugin-dir', dir);
  const extra = extraArgsInput.value.trim();
  if (extra) args.push(...extra.split(/\s+/).filter(Boolean));
  return { args, cwd: selectedFolder ?? '' };
}

function launch(): void {
  launchedModel = optModel.value;
  const folderKey = selectedFolder ?? '';

  // Snapshot form state before applySettings overwrites it with persisted values
  const { args, cwd } = assembleArgs();
  const launchOptions: LaunchOptions = {
    resume: optResume.checked || undefined,
    continue: optContinue.checked || undefined,
    model: optModel.value || undefined,
    effort: optEffort.value || undefined,
    permissionMode: optPermissionMode.value || undefined,
    pluginDirs: selectedPluginDirs.length > 0 ? selectedPluginDirs : undefined,
    extraArgs: extraArgsInput.value.trim() || undefined,
  };

  // Clear error log from any previous session
  errorsFeed.innerHTML = '';
  errorPopupList.innerHTML = '';
  liveErrorCards.length = 0;

  // Create widget panels now that the selected folder is known, filtering disabled widgets
  const folderSettings = allFolderSettings[folderKey] ?? {};
  const disabledSet = new Set(folderSettings.disabledWidgets ?? []);
  createWidgetPanels(allDescriptors.filter(d => !disabledSet.has(d.id)));
  // Re-apply panel layout so saved order includes widget sections.
  // Preserve the accent color the user may have changed on the launch screen
  // before applySettings overwrites it with the persisted value.
  const chosenAccent = accentColorInput.value;
  applySettings(folderSettings);
  setAccentColor(chosenAccent);

  if (selectedPluginDirs.length > 0) {
    window.electronAPI.addRecentPlugins(selectedPluginDirs);
  }

  window.electronAPI.setLaunchOptions(folderKey, launchOptions);
  window.electronAPI.setAccentColor(folderKey, accentColorInput.value !== '#4ec94e'
    ? accentColorInput.value
    : undefined);

  const folderName = selectedFolder
    ? selectedFolder.split(/[\\/]/).filter(Boolean).pop() ?? selectedFolder
    : 'Gada Terminal';
  titlebarText.textContent = folderName;

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
  const [recentFolders, initialArgs, settings, descriptors, recentPlugins] = await Promise.all([
    window.electronAPI.getRecentFolders(),
    window.electronAPI.getInitialArgs(),
    window.electronAPI.getAllFolderSettings(),
    window.electronAPI.getWidgetDescriptors(),
    window.electronAPI.getRecentPlugins(),
  ]);
  allDescriptors = descriptors;
  allFolderSettings = settings;
  if (initialArgs.length > 0) extraArgsInput.value = initialArgs.join(' ');
  renderRecentFolders(recentFolders);
  recentPluginDirs = recentPlugins;
  applySettings(allFolderSettings[''] ?? {});
  renderRecentPlugins();
})();
