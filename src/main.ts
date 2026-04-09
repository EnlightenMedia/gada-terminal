import squirrelStartup from 'electron-squirrel-startup';
if (squirrelStartup) process.exit(0);

import { app, BrowserWindow, ipcMain, clipboard, Menu, dialog, screen } from 'electron';
import * as path from 'path';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
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
import type { ToolEvent, ApiRequestEvent, PermissionRequest, PermissionDecision, PluginDescriptor } from './types';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
let plugins: PluginDescriptor[] = [];

function loadPlugins(userDataPath: string): PluginDescriptor[] {
  const scanDirs = [
    path.join(userDataPath, 'plugins', 'panels'),
    path.join(app.getAppPath(), 'plugins'),
  ];

  const descriptors: PluginDescriptor[] = [];
  const seen = new Set<string>();

  for (const scanDir of scanDirs) {
    if (!existsSync(scanDir)) continue;
    let entries: string[];
    try { entries = readdirSync(scanDir); } catch { continue; }

    for (const entry of entries) {
      const pluginDir = path.join(scanDir, entry);
      try { if (!statSync(pluginDir).isDirectory()) continue; } catch { continue; }

      const manifestPath = path.join(pluginDir, 'panel-plugin.json');
      if (!existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        const { id, name, version, entry: entryFile, permissions } = manifest;
        if (!id || typeof id !== 'string' || !entryFile || typeof entryFile !== 'string') continue;
        if (seen.has(id)) continue;

        const entryPath = path.join(pluginDir, entryFile);
        if (!existsSync(entryPath)) continue;

        seen.add(id);
        descriptors.push({
          id,
          name: name ?? id,
          version: version ?? '0.0.0',
          permissions: Array.isArray(permissions) ? permissions : [],
          entrySource: readFileSync(entryPath, 'utf-8'),
        });
      } catch { /* skip invalid plugins silently */ }
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
let hookPort = 0;
let hookServerClose: (() => void) | null = null;
let hookDecidePermission: ((id: string, decision: PermissionDecision) => void) | null = null;

const sessionAllowedTools = new Set<string>();
const pendingToolNames = new Map<string, string>(); // id → toolName

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
  plugins = loadPlugins(userDataPath);

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
    (req: PermissionRequest) => {
      if (sessionAllowedTools.has(req.toolName)) {
        hookDecidePermission?.(req.id, 'allow');
        return;
      }
      pendingToolNames.set(req.id, req.toolName);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hook:permission-request', req);
      }
    },
    (mode: string) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('hook:permission-mode', mode);
      }
    }
  );
  hookDecidePermission = hookServer.decidePermission.bind(hookServer);
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

// Permission approval
ipcMain.handle('permission:decide', (_, id: string, decision: PermissionDecision) => {
  if (decision === 'allow-session') {
    const toolName = pendingToolNames.get(id);
    if (toolName) sessionAllowedTools.add(toolName);
  }
  pendingToolNames.delete(id);
  hookDecidePermission?.(id, decision);
});

// Plugins
ipcMain.handle('plugins:get-descriptors', () => plugins);
ipcMain.handle('plugins:pick-dir', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.canceled ? null : (result.filePaths[0] ?? null);
});
ipcMain.handle('plugins:get-recent', () => getRecentPlugins(userDataPath));
ipcMain.on('plugins:add-recent', (_, dirs: string[]) => addRecentPlugins(userDataPath, dirs));

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
