import * as fs from 'fs';
import * as path from 'path';
export interface LaunchOptions {
  resume?: boolean;
  continue?: boolean;
  model?: string;
  effort?: string;
  permissionMode?: string;
  pluginDirs?: string[];
  extraArgs?: string;
}

export interface FolderSettings {
  accentColor?: string;
  panelLayout?: { order: string[]; hidden: string[] };
  launchOptions?: LaunchOptions;
  enabledPlugins?: string[];
}

export interface GlobalSettings {
  windowBounds?: { x: number; y: number; width: number; height: number };
}

export function getGlobalSettings(userDataPath: string): GlobalSettings {
  return loadJSON<GlobalSettings>(path.join(userDataPath, 'global-settings.json'), {});
}

export function saveGlobalSettings(userDataPath: string, settings: GlobalSettings): void {
  saveJSON(path.join(userDataPath, 'global-settings.json'), settings);
}

function loadJSON<T>(filePath: string, defaultValue: T): T {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

function saveJSON(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function getRecentFolders(userDataPath: string): string[] {
  return loadJSON<string[]>(path.join(userDataPath, 'recent-folders.json'), []);
}

export function saveRecentFolders(userDataPath: string, folders: string[]): void {
  saveJSON(path.join(userDataPath, 'recent-folders.json'), folders);
}

export function getAllFolderSettings(userDataPath: string): Record<string, FolderSettings> {
  return loadJSON<Record<string, FolderSettings>>(
    path.join(userDataPath, 'folder-settings.json'),
    {}
  );
}

export function getFolderSettings(userDataPath: string, folder: string): FolderSettings {
  const all = getAllFolderSettings(userDataPath);
  return all[folder] ?? {};
}

export function saveFolderSetting<K extends keyof FolderSettings>(
  userDataPath: string,
  folder: string,
  key: K,
  value: FolderSettings[K]
): void {
  const all = getAllFolderSettings(userDataPath);
  if (!all[folder]) all[folder] = {};
  all[folder][key] = value;
  saveJSON(path.join(userDataPath, 'folder-settings.json'), all);
}

export function addRecentFolder(userDataPath: string, folder: string): void {
  if (!folder) return; // Don't store empty-string default in recent list
  const existing = getRecentFolders(userDataPath);
  const updated = [folder, ...existing.filter(f => f !== folder)].slice(0, 10);
  saveRecentFolders(userDataPath, updated);
}

export function getRecentPlugins(userDataPath: string): string[] {
  return loadJSON<string[]>(path.join(userDataPath, 'recent-plugins.json'), []);
}

export function addRecentPlugins(userDataPath: string, dirs: string[]): void {
  if (dirs.length === 0) return;
  const existing = getRecentPlugins(userDataPath);
  const merged = [...dirs, ...existing.filter(d => !dirs.includes(d))].slice(0, 20);
  saveJSON(path.join(userDataPath, 'recent-plugins.json'), merged);
}
