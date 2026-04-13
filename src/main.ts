import squirrelStartup from 'electron-squirrel-startup';
if (squirrelStartup) process.exit(0);

import { app, BrowserWindow, ipcMain, clipboard, Menu, dialog, screen } from 'electron';
import * as path from 'path';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { execFile, spawn } from 'child_process';
import * as https from 'https';
import * as http from 'http';
import * as pty from 'node-pty';
import { IPty } from 'node-pty';
import {
  getRecentFolders,
  getAllFolderSettings,
  getFolderSettings,
  saveFolderSetting,
  addRecentFolder,
  getRecentPlugins,
  addRecentPlugins,
  getGlobalSettings,
  saveGlobalSettings,
} from './persistence';
import type { FolderSettings, LaunchOptions } from './persistence';
import { startHookServer } from './hookServer';
import { buildSettingsArgs } from './settingsBuilder';
import type { ToolEvent, ApiRequestEvent, WidgetDescriptor, WidgetCapabilityRequest } from './types';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
let widgets: WidgetDescriptor[] = [];

function loadWidgets(userDataPath: string): WidgetDescriptor[] {
  const scanDirs = [
    path.join(userDataPath, 'widgets'),
    path.join(app.getAppPath(), 'widgets'),
  ];

  const descriptors: WidgetDescriptor[] = [];
  const seen = new Set<string>();

  for (const scanDir of scanDirs) {
    if (!existsSync(scanDir)) continue;
    let entries: string[];
    try { entries = readdirSync(scanDir); } catch { continue; }

    for (const entry of entries) {
      const widgetDir = path.join(scanDir, entry);
      try { if (!statSync(widgetDir).isDirectory()) continue; } catch { continue; }

      const manifestPath = path.join(widgetDir, 'widget.json');
      if (!existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        const { id, name, version, entry: entryFile, permissions, capabilities, os } = manifest;
        if (!id || typeof id !== 'string' || !entryFile || typeof entryFile !== 'string') continue;
        if (seen.has(id)) continue;

        // Skip widgets that declare an os list that doesn't include the current platform
        if (Array.isArray(os) && !os.includes(process.platform)) continue;

        const entryPath = path.join(widgetDir, entryFile);
        if (!existsSync(entryPath)) continue;

        seen.add(id);
        descriptors.push({
          id,
          name: name ?? id,
          version: version ?? '0.0.0',
          permissions: Array.isArray(permissions) ? permissions : [],
          capabilities: Array.isArray(capabilities) ? capabilities : [],
          entrySource: readFileSync(entryPath, 'utf-8'),
          os: Array.isArray(os) ? os : undefined,
        });
      } catch { /* skip invalid widgets silently */ }
    }
  }

  return descriptors;
}
let ptyProcess: IPty | null = null;
let termCols = 80;
let termRows = 24;
let quitting = false;
let claudeSpawned = false;
let userDataPath: string;
let currentFolder = '';
let hookPort = 0;
let hookServerClose: (() => void) | null = null;

// Widget capability grants
// sessionGranted: widgetId → Set<capability>  (in-memory, cleared on restart)
// sessionDenied:  widgetId → Set<capability>  (in-memory, cleared on restart)
const sessionGrantedCapabilities = new Map<string, Set<string>>();
const sessionDeniedCapabilities = new Map<string, Set<string>>();

type PendingCapabilityEntry = {
  widgetId: string;
  capability: string;
  args: unknown[];
  resolve: (value: { ok: boolean; result?: unknown; error?: string }) => void;
};
const pendingCapabilities = new Map<string, PendingCapabilityEntry>(); // approvalId → entry

function findClaudePath(): string {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
  const candidates: string[] = [];

  if (process.platform === 'win32') {
    candidates.push(path.join(home, '.local', 'bin', 'claude.exe'));
    candidates.push('claude.exe');
  } else {
    candidates.push(path.join(home, '.local', 'bin', 'claude'));
    candidates.push('/usr/local/bin/claude');
    candidates.push('/opt/homebrew/bin/claude');
  }

  candidates.push('claude');
  return candidates.find(p => existsSync(p)) ?? 'claude';
}

function spawnClaude(args: string[], cwd: string): void {
  if (claudeSpawned) return;
  claudeSpawned = true;
  currentFolder = cwd;

  addRecentFolder(userDataPath, cwd);

  const claudePath = findClaudePath();
  const finalArgs = buildSettingsArgs(hookPort, args);

  ptyProcess = pty.spawn(claudePath, finalArgs, {
    name: 'xterm-256color',
    cols: termCols,
    rows: termRows,
    cwd: cwd || process.cwd(),
    env: {
      ...process.env,
      OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${hookPort}`,
      OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
      OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: `http://127.0.0.1:${hookPort}/v1/logs`,
      OTEL_EXPORTER_OTLP_LOGS_PROTOCOL: 'http/json',
      OTEL_LOGS_EXPORTER: 'otlp',
      CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    } as Record<string, string>,
  });

  ptyProcess.onData((data: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:data', data);
      if (data.includes('\u276f') && !mainWindow.isFocused()) {
        mainWindow.flashFrame(true);
      }
    }
  });

  ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
    ptyProcess = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:exit', exitCode);
    }
    if (quitting) app.quit();
  });
}

function symbolColorFor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 0.5 ? '#000000' : '#ffffff';
}

function clampBoundsToScreens(
  bounds: { x: number; y: number; width: number; height: number }
): { x: number; y: number; width: number; height: number } | undefined {
  const displays = screen.getAllDisplays();
  const visible = displays.some(d => {
    const b = d.workArea;
    return (
      bounds.x < b.x + b.width &&
      bounds.x + bounds.width > b.x &&
      bounds.y < b.y + b.height &&
      bounds.y + bounds.height > b.y
    );
  });
  return visible ? bounds : undefined;
}

async function createWindow(): Promise<void> {
  userDataPath = app.getPath('userData');
  widgets = loadWidgets(userDataPath);

  // Start hook server before showing the window so hookPort is ready for spawn
  const hookServer = await startHookServer(
    (event: ToolEvent) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hook:tool-event', event);
      }
    },
    (event: ApiRequestEvent) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hook:api-request', event);
      }
    },
  );
  hookPort = hookServer.port;
  hookServerClose = hookServer.close;

  const savedBounds = clampBoundsToScreens(
    getGlobalSettings(userDataPath).windowBounds ?? { x: 0, y: 0, width: 1400, height: 800 }
  );

  mainWindow = new BrowserWindow({
    width: savedBounds?.width ?? 1400,
    height: savedBounds?.height ?? 800,
    x: savedBounds?.x,
    y: savedBounds?.y,
    show: false,
    backgroundColor: '#1e1e1e',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1e1e1e',
      symbolColor: '#e0e0e0',
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow!.show();
    mainWindow!.focus();
  });

  const saveGeometry = (): void => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized()) {
      const bounds = mainWindow.getBounds();
      saveGlobalSettings(userDataPath, { windowBounds: bounds });
    }
  };
  mainWindow.on('resize', saveGeometry);
  mainWindow.on('move', saveGeometry);

  Menu.setApplicationMenu(null);

  mainWindow.webContents.on('before-input-event', (_, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }
}

// IPC handlers

ipcMain.on('terminal:ready', () => {});

ipcMain.on('terminal:resize', (_, cols: number, rows: number) => {
  termCols = cols;
  termRows = rows;
  if (ptyProcess) {
    try {
      ptyProcess.resize(cols, rows);
    } catch {
      // PTY may have already exited
    }
  }
});

ipcMain.on('terminal:input', (_, data: string) => {
  ptyProcess?.write(data);
});

ipcMain.on('terminal:launch', (_, args: string[], cwd: string) => {
  spawnClaude(args, cwd);
});

// Folder / settings IPC

ipcMain.handle('terminal:get-args', () => {
  const fromEnv = (process.env.CLAUDE_ARGS ?? '').split(/\s+/).filter(Boolean);
  const separatorIdx = process.argv.indexOf('--');
  const fromArgv = separatorIdx >= 0 ? process.argv.slice(separatorIdx + 1) : [];
  return [...fromEnv, ...fromArgv];
});

ipcMain.handle('folders:pick', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});

ipcMain.handle('folders:get-recent', () => getRecentFolders(userDataPath));
ipcMain.handle('folders:get-settings', (_, folder: string) => getFolderSettings(userDataPath, folder));
ipcMain.handle('folders:get-all-settings', () => getAllFolderSettings(userDataPath));

ipcMain.on('folders:set-accent-color', (_, folder: string, color: string | undefined) => {
  saveFolderSetting(userDataPath, folder, 'accentColor', color);
});

ipcMain.on('folders:set-launch-options', (_, folder: string, options: LaunchOptions) => {
  saveFolderSetting(userDataPath, folder, 'launchOptions', options);
});

ipcMain.on('folders:set-panel-layout', (_, folder: string, layout: FolderSettings['panelLayout']) => {
  saveFolderSetting(userDataPath, folder, 'panelLayout', layout);
});

ipcMain.on('folders:set-sidebar-width', (_, folder: string, width: number) => {
  saveFolderSetting(userDataPath, folder, 'sidebarWidth', width);
});

ipcMain.on('folders:set-sidebar-left-width', (_, folder: string, width: number) => {
  saveFolderSetting(userDataPath, folder, 'sidebarLeftWidth', width);
});

ipcMain.on('window:set-accent-color', (_, color: string | null) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const accentColor = color ?? '#1e1e1e';
    mainWindow.setTitleBarOverlay({
      color: accentColor,
      symbolColor: symbolColorFor(accentColor),
    });
    if (process.platform === 'win32') {
      mainWindow.setAccentColor(accentColor);
    }
  }
});

// Widgets
ipcMain.handle('widgets:get-descriptors', () => widgets);

// Claude Code plugin dirs (launch screen — these remain "plugins" as they reference the Claude CLI flag)
ipcMain.handle('plugins:pick-dir', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});
ipcMain.handle('plugins:get-recent', () => getRecentPlugins(userDataPath));
ipcMain.on('plugins:add-recent', (_, dirs: string[]) => addRecentPlugins(userDataPath, dirs));

// Widget capability helpers

function isCapabilityGranted(widgetId: string, capability: string): boolean {
  if (sessionGrantedCapabilities.get(widgetId)?.has(capability)) return true;
  if (currentFolder) {
    const grants = getFolderSettings(userDataPath, currentFolder).widgetGrants ?? {};
    if (grants[widgetId]?.includes(capability)) return true;
  }
  return false;
}

function isCapabilityDenied(widgetId: string, capability: string): boolean {
  return sessionDeniedCapabilities.get(widgetId)?.has(capability) ?? false;
}

function executeCapability(capability: string, args: unknown[]): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  return new Promise(resolve => {
    try {
      if (capability === 'terminal:write') {
        const text = typeof args[0] === 'string' ? args[0] : '';
        ptyProcess?.write(text);
        resolve({ ok: true });
      } else if (capability === 'claude:message') {
        const text = typeof args[0] === 'string' ? args[0] : '';
        ptyProcess?.write(text + '\n');
        resolve({ ok: true });
      } else if (capability === 'process:spawn') {
        const cmd = typeof args[0] === 'string' ? args[0] : '';
        const spawnArgs = Array.isArray(args[1]) ? (args[1] as string[]).map(String) : [];
        execFile(cmd, spawnArgs, { timeout: 10000 }, (err, stdout, stderr) => {
          if (err && !stdout && !stderr) {
            resolve({ ok: false, error: err.message });
          } else {
            resolve({ ok: true, result: { stdout, stderr, exitCode: err?.code ?? 0 } });
          }
        });
      } else if (capability === 'http:request') {
        const url = typeof args[0] === 'string' ? args[0] : '';
        const opts = (args[1] && typeof args[1] === 'object' ? args[1] : {}) as {
          method?: string; headers?: Record<string, string>; body?: string;
        };
        const parsed = new URL(url);
        const lib = parsed.protocol === 'https:' ? https : http;
        const reqOpts: http.RequestOptions = {
          method: opts.method ?? 'GET',
          headers: opts.headers ?? {},
        };
        const req = lib.request(parsed, reqOpts, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            resolve({ ok: true, result: { status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8') } });
          });
        });
        req.on('error', (err: Error) => resolve({ ok: false, error: err.message }));
        if (opts.body) req.write(opts.body);
        req.end();
      } else if (capability === 'shell:launch') {
        const opts = (args[0] && typeof args[0] === 'object' ? args[0] : {}) as {
          mode?: string; terminal?: string; cwd?: string;
        };
        if (opts.mode === 'probe') {
          // Return which terminal executables are available on PATH
          const candidates = [
            { id: 'wt',          label: 'Windows Terminal', exe: 'wt.exe' },
            { id: 'pwsh',        label: 'PowerShell 7',     exe: 'pwsh.exe' },
            { id: 'powershell',  label: 'Windows PowerShell', exe: 'powershell.exe' },
            { id: 'cmd',         label: 'Command Prompt',   exe: 'cmd.exe' },
          ];
          const checks = candidates.map(c => new Promise<typeof c | null>(res => {
            execFile('where.exe', [c.exe], { timeout: 3000 }, (err) => res(err ? null : c));
          }));
          Promise.all(checks).then(results => {
            resolve({ ok: true, result: results.filter(Boolean) });
          });
        } else if (opts.mode === 'launch') {
          const terminal = opts.terminal ?? 'cmd';
          const cwd = typeof opts.cwd === 'string' ? opts.cwd : '';
          // Use `cmd /c start` to open console apps in a new visible window.
          // wt is a GUI app that manages its own window, but routing it through
          // start is harmless and keeps the pattern consistent.
          let innerCmd: string;
          let innerArgs: string[];
          if (terminal === 'wt') {
            innerCmd = 'wt.exe'; innerArgs = ['-d', cwd];
          } else if (terminal === 'pwsh') {
            innerCmd = 'pwsh.exe'; innerArgs = ['-NoExit', '-Command', `Set-Location '${cwd}'`];
          } else if (terminal === 'powershell') {
            innerCmd = 'powershell.exe'; innerArgs = ['-NoExit', '-Command', `Set-Location '${cwd}'`];
          } else {
            innerCmd = 'cmd.exe'; innerArgs = ['/K', `cd /d "${cwd}"`];
          }
          try {
            const child = spawn('cmd.exe', ['/c', 'start', '', innerCmd, ...innerArgs], {
              detached: true,
              stdio: 'ignore',
              shell: false,
            });
            child.unref();
            resolve({ ok: true });
          } catch (err) {
            resolve({ ok: false, error: String(err) });
          }
        } else {
          resolve({ ok: false, error: 'shell:launch requires mode "probe" or "launch"' });
        }
      } else {
        resolve({ ok: false, error: `Unknown capability: ${capability}` });
      }
    } catch (err) {
      resolve({ ok: false, error: String(err) });
    }
  });
}

ipcMain.handle('widget:capability-request', async (_, widgetId: string, capability: string, args: unknown[]): Promise<{ ok: boolean; result?: unknown; error?: string }> => {
  const widget = widgets.find(w => w.id === widgetId);
  if (!widget) return { ok: false, error: 'Unknown widget' };
  if (!widget.capabilities.includes(capability)) {
    return { ok: false, error: `Capability '${capability}' not declared in manifest` };
  }

  if (isCapabilityDenied(widgetId, capability)) {
    return { ok: false, error: 'Permission denied' };
  }

  if (isCapabilityGranted(widgetId, capability)) {
    return executeCapability(capability, args);
  }

  // Not yet decided — emit approval request to renderer and hold the response
  const approvalId = `${widgetId}:${capability}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const req: WidgetCapabilityRequest = {
    id: approvalId,
    widgetId,
    widgetName: widget.name,
    capability,
    timestamp: Date.now(),
  };

  return new Promise(resolve => {
    pendingCapabilities.set(approvalId, { widgetId, capability, args, resolve });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hook:widget-capability-request', req);
    }
  });
});

ipcMain.handle('widget:capability-decide', async (_, approvalId: string, decision: 'allow' | 'allow-session' | 'deny') => {
  const entry = pendingCapabilities.get(approvalId);
  if (!entry) return;
  pendingCapabilities.delete(approvalId);

  const { widgetId, capability, args, resolve } = entry;

  if (decision === 'allow') {
    if (currentFolder) {
      const settings = getFolderSettings(userDataPath, currentFolder);
      const grants = { ...(settings.widgetGrants ?? {}) };
      if (!grants[widgetId]) grants[widgetId] = [];
      if (!grants[widgetId].includes(capability)) grants[widgetId] = [...grants[widgetId], capability];
      saveFolderSetting(userDataPath, currentFolder, 'widgetGrants', grants);
    }
    resolve(await executeCapability(capability, args));
  } else if (decision === 'allow-session') {
    if (!sessionGrantedCapabilities.has(widgetId)) sessionGrantedCapabilities.set(widgetId, new Set());
    sessionGrantedCapabilities.get(widgetId)!.add(capability);
    resolve(await executeCapability(capability, args));
  } else {
    if (!sessionDeniedCapabilities.has(widgetId)) sessionDeniedCapabilities.set(widgetId, new Set());
    sessionDeniedCapabilities.get(widgetId)!.add(capability);
    resolve({ ok: false, error: 'Permission denied' });
  }
});

// Widget management
ipcMain.on('widget:set-disabled', (_, widgetId: string, disabled: boolean) => {
  if (!currentFolder) return;
  const settings = getFolderSettings(userDataPath, currentFolder);
  const current = new Set(settings.disabledWidgets ?? []);
  if (disabled) current.add(widgetId);
  else current.delete(widgetId);
  saveFolderSetting(userDataPath, currentFolder, 'disabledWidgets', [...current]);
});

ipcMain.on('widget:revoke-grant', (_, widgetId: string, capability: string) => {
  if (currentFolder) {
    const settings = getFolderSettings(userDataPath, currentFolder);
    const grants = { ...(settings.widgetGrants ?? {}) };
    if (grants[widgetId]) {
      grants[widgetId] = grants[widgetId].filter(c => c !== capability);
      if (grants[widgetId].length === 0) delete grants[widgetId];
      saveFolderSetting(userDataPath, currentFolder, 'widgetGrants', grants);
    }
  }
  sessionGrantedCapabilities.get(widgetId)?.delete(capability);
});

// Clipboard
ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.handle('clipboard:write', (_, text: string) => clipboard.writeText(text));

// App lifecycle

app.on('ready', () => { createWindow(); });

app.on('window-all-closed', () => {
  quitting = true;
  hookServerClose?.();
  if (ptyProcess) {
    ptyProcess.kill();
  } else {
    app.quit();
  }
});
