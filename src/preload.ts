import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Renderer → Main (fire-and-forget)
  sendReady: () => ipcRenderer.send('terminal:ready'),
  sendInput: (data: string) => ipcRenderer.send('terminal:input', data),
  sendResize: (cols: number, rows: number) => ipcRenderer.send('terminal:resize', cols, rows),
  launchClaude: (args: string[], cwd: string) => ipcRenderer.send('terminal:launch', args, cwd),
  setAccentColor: (folder: string, color: string | undefined) =>
    ipcRenderer.send('folders:set-accent-color', folder, color),
  setLaunchOptions: (folder: string, options: unknown) =>
    ipcRenderer.send('folders:set-launch-options', folder, options),
  setPanelLayout: (folder: string, layout: { order: string[]; hidden: string[]; sides?: Record<string, string> }) =>
    ipcRenderer.send('folders:set-panel-layout', folder, layout),
  setSidebarWidth: (folder: string, width: number) =>
    ipcRenderer.send('folders:set-sidebar-width', folder, width),
  setSidebarLeftWidth: (folder: string, width: number) =>
    ipcRenderer.send('folders:set-sidebar-left-width', folder, width),
  setWindowAccentColor: (color: string | null) =>
    ipcRenderer.send('window:set-accent-color', color),

  // Renderer → Main (invoke, returns Promise)
  readClipboard: () => ipcRenderer.invoke('clipboard:read'),
  writeClipboard: (text: string) => ipcRenderer.invoke('clipboard:write', text),
  getInitialArgs: () => ipcRenderer.invoke('terminal:get-args'),
  getSession: () => ipcRenderer.invoke('terminal:get-session'),
  pickFolder: () => ipcRenderer.invoke('folders:pick'),
  getRecentFolders: () => ipcRenderer.invoke('folders:get-recent'),
  getFolderSettings: (folder: string) => ipcRenderer.invoke('folders:get-settings', folder),
  getAllFolderSettings: () => ipcRenderer.invoke('folders:get-all-settings'),

  // Main → Renderer (event subscriptions)
  onTerminalData: (callback: (data: string) => void) =>
    ipcRenderer.on('terminal:data', (_, data) => callback(data)),
  onTerminalExit: (callback: (code: number) => void) =>
    ipcRenderer.on('terminal:exit', (_, code) => callback(code)),
  onToolEvent: (callback: (event: unknown) => void) =>
    ipcRenderer.on('hook:tool-event', (_, event) => callback(event)),
  onApiRequest: (callback: (event: unknown) => void) =>
    ipcRenderer.on('hook:api-request', (_, event) => callback(event)),
  // File drag-and-drop path extraction (File.path unavailable with context isolation)
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  // Widget loading
  getWidgetDescriptors: () => ipcRenderer.invoke('widgets:get-descriptors'),

  // Widget capability approval
  widgetCapabilityRequest: (widgetId: string, capability: string, args: unknown[]) =>
    ipcRenderer.invoke('widget:capability-request', widgetId, capability, args),
  widgetCapabilityDecide: (id: string, decision: string) =>
    ipcRenderer.invoke('widget:capability-decide', id, decision),
  onWidgetCapabilityRequest: (callback: (req: unknown) => void) =>
    ipcRenderer.on('hook:widget-capability-request', (_, req) => callback(req)),

  // Widget management
  setWidgetDisabled: (widgetId: string, disabled: boolean) =>
    ipcRenderer.send('widget:set-disabled', widgetId, disabled),
  revokeWidgetGrant: (widgetId: string, capability: string) =>
    ipcRenderer.send('widget:revoke-grant', widgetId, capability),

  // Claude Code plugin dirs (launch screen)
  pickPluginDir: () => ipcRenderer.invoke('plugins:pick-dir'),
  getRecentPlugins: () => ipcRenderer.invoke('plugins:get-recent'),
  addRecentPlugins: (dirs: string[]) => ipcRenderer.send('plugins:add-recent', dirs),
});
