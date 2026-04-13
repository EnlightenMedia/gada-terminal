import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

interface HookEntry {
  hooks: { type: string; url: string }[];
}

interface HooksConfig {
  PreToolUse?: HookEntry[];
  PostToolUse?: HookEntry[];
  PostToolUseFailure?: HookEntry[];
}

interface SettingsObject {
  hooks?: HooksConfig;
  [key: string]: unknown;
}

function buildAppHooks(port: number): HooksConfig {
  const entry: HookEntry = {
    hooks: [{ type: 'http', url: `http://127.0.0.1:${port}/hooks` }],
  };
  return {
    PostToolUse: [entry],
    PostToolUseFailure: [entry],
  };
}

/**
 * Writes the merged settings to a temp file and returns args with --settings <path>.
 * Using a file path avoids Windows command-line quote-escaping issues with inline JSON.
 */
export function buildSettingsArgs(port: number, args: string[]): string[] {
  if (port === 0) {
    console.error('[settingsBuilder] Hook server port is 0 — skipping --settings injection');
    return args;
  }

  const filtered: string[] = [];
  let userSettings: SettingsObject | null = null;
  let i = 0;

  while (i < args.length) {
    const arg = args[i];
    if (arg === '--settings' && i + 1 < args.length) {
      const val = args[i + 1];
      // Could be a file path or inline JSON
      if (val.startsWith('{')) {
        try {
          userSettings = JSON.parse(val) as SettingsObject;
        } catch {
          console.warn('[settingsBuilder] User --settings JSON is invalid — using app hooks only');
        }
      } else {
        try {
          userSettings = JSON.parse(fs.readFileSync(val, 'utf-8')) as SettingsObject;
        } catch {
          console.warn('[settingsBuilder] Could not read user --settings file — using app hooks only');
        }
      }
      i += 2;
    } else if (arg.startsWith('--settings=')) {
      const val = arg.slice('--settings='.length);
      try {
        userSettings = (val.startsWith('{')
          ? JSON.parse(val)
          : JSON.parse(fs.readFileSync(val, 'utf-8'))) as SettingsObject;
      } catch {
        console.warn('[settingsBuilder] User --settings is invalid — using app hooks only');
      }
      i += 1;
    } else {
      filtered.push(arg);
      i += 1;
    }
  }

  const appHooks = buildAppHooks(port);
  let merged: SettingsObject;

  if (userSettings) {
    const userHooks = userSettings.hooks ?? {};
    merged = {
      ...userSettings,
      hooks: {
        ...(userHooks.PreToolUse ? { PreToolUse: userHooks.PreToolUse } : {}),
        PostToolUse: [...(userHooks.PostToolUse ?? []), ...(appHooks.PostToolUse ?? [])],
        PostToolUseFailure: [
          ...(userHooks.PostToolUseFailure ?? []),
          ...(appHooks.PostToolUseFailure ?? []),
        ],
      },
    };
  } else {
    merged = { hooks: appHooks };
  }

  // Write to a temp file — avoids Windows command-line escaping issues with JSON quotes
  const tempFile = path.join(os.tmpdir(), `gada-settings-${Date.now()}.json`);
  fs.writeFileSync(tempFile, JSON.stringify(merged), 'utf-8');
  console.log(`[settingsBuilder] Settings written to ${tempFile}`);

  return [...filtered, '--settings', tempFile];
}
