import type { LaunchOptions, FolderSettings } from './persistence';

export type { LaunchOptions, FolderSettings };

export interface PluginDescriptor {
  id: string;
  name: string;
  version: string;
  permissions: string[];
  entrySource: string;
}

export interface ToolEvent {
  id: string;
  event: 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure';
  toolName: string;
  input: Record<string, unknown>;
  output?: string;
  error?: string;
  timestamp: number;
}

export interface ApiRequestEvent {
  timestamp: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

export type PermissionDecision = 'allow' | 'allow-session' | 'deny';

export interface PermissionRequest {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  timestamp: number;
}

declare global {
  interface Window {
    electronAPI: {
      // Renderer → Main (fire-and-forget)
      sendReady: () => void;
      sendInput: (data: string) => void;
      sendResize: (cols: number, rows: number) => void;
      launchClaude: (args: string[], cwd: string) => void;
      setAccentColor: (folder: string, color: string | undefined) => void;
      setLaunchOptions: (folder: string, options: LaunchOptions) => void;
      setPanelLayout: (folder: string, layout: { order: string[]; hidden: string[] }) => void;
      setWindowAccentColor: (color: string | null) => void;

      // Renderer → Main (invoke, returns Promise)
      readClipboard: () => Promise<string>;
      writeClipboard: (text: string) => Promise<void>;
      getInitialArgs: () => Promise<string[]>;
      pickFolder: () => Promise<string | null>;
      getRecentFolders: () => Promise<string[]>;
      getFolderSettings: (folder: string) => Promise<FolderSettings>;
      getAllFolderSettings: () => Promise<Record<string, FolderSettings>>;

      // Renderer → Main (invoke, returns Promise)
      decidePermission: (id: string, decision: PermissionDecision) => Promise<void>;

      // Main → Renderer (event subscriptions)
      onTerminalData: (callback: (data: string) => void) => void;
      onTerminalExit: (callback: (code: number) => void) => void;
      onToolEvent: (callback: (event: ToolEvent) => void) => void;
      onApiRequest: (callback: (event: ApiRequestEvent) => void) => void;
      onPermissionRequest: (callback: (req: PermissionRequest) => void) => void;

      // File drag-and-drop (requires webUtils, not available via standard File.path with context isolation)
      getPathForFile: (file: File) => string;

      // Panel plugin loading
      getPluginDescriptors: () => Promise<PluginDescriptor[]>;

      // Claude Code plugin dirs (launch screen)
      pickPluginDir: () => Promise<string | null>;
      getRecentPlugins: () => Promise<string[]>;
      addRecentPlugins: (dirs: string[]) => void;
    };
  }
}
