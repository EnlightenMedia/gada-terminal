# Gada Terminal — Product Specification

This document is a complete specification for rebuilding the Gada Terminal application from scratch. It describes what the app does, how it is structured, and every integration point in enough detail that an AI or developer can reproduce the full application.

---

## 1. Product Overview

Gada Terminal is a cross-platform desktop application (Electron) that wraps the Claude Code CLI (`claude`) with a real-time monitoring sidebar. The main pane is a full-fidelity terminal running Claude via xterm.js + node-pty. Side panels — powered by Claude Code's hooks system and OpenTelemetry export — show a live tool-call feed, token/cost tracking, context window usage, and a structured permission-approval UI.

**Core Value**
- See tool calls, costs, and context usage at a glance while working
- Approve or deny tool permissions from the sidebar instead of the terminal
- Configure launch options (model, effort, plugins, etc.) through a GUI
- Persist preferences per working directory

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Electron ~41 |
| Terminal emulation | xterm.js ~6 + @xterm/addon-fit ~0.11 |
| PTY | node-pty ~1.1 (N-API prebuilt, no compile needed) |
| Build | Electron Forge ~7.11 with Vite plugin ~5.4 |
| Packaging | Platform-specific (see §2.1) |
| Language | TypeScript ~5, targeting ESNext/CommonJS |

### 2.1 Packaging

| Platform | Maker |
|---|---|
| Windows | `@electron-forge/maker-squirrel` |
| macOS | `@electron-forge/maker-dmg` |
| Linux | `@electron-forge/maker-deb` and/or `@electron-forge/maker-rpm` |

### Dependencies

```json
{
  "dependencies": {
    "@xterm/xterm": "^6.0.0",
    "@xterm/addon-fit": "^0.11.0",
    "node-pty": "^1.1.0",
    "electron-squirrel-startup": "^1.0.1"
  },
  "devDependencies": {
    "@electron-forge/cli": "^7.11.0",
    "@electron-forge/maker-squirrel": "^7.11.0",
    "@electron-forge/maker-dmg": "^7.11.0",
    "@electron-forge/maker-deb": "^7.11.0",
    "@electron-forge/maker-rpm": "^7.11.0",
    "@electron-forge/plugin-auto-unpack-natives": "^7.11.0",
    "@electron-forge/plugin-vite": "^7.11.0",
    "@electron/rebuild": "^3.0.0",
    "electron": "^41.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.4.0"
  }
}
```

### Build Configuration

- **Forge**: ASAR packaging enabled, platform-appropriate maker(s), auto-unpack natives plugin, Vite plugin with three build targets (main, preload, renderer).
- **Vite main config**: node-pty marked as external (not bundled).
- **Vite preload/renderer configs**: Empty (defaults).
- **tsconfig**: ESNext target, CommonJS module, sourceMap on, noImplicitAny, esModuleInterop, resolveJsonModule.
- **Rebuild config**: `onlyModules: []` because node-pty ships prebuilt N-API binaries.

---

## 3. Architecture

The app follows Electron's standard three-process model with strict context isolation:

```
main.ts (Node.js)
  |-- PTY process (claude CLI via node-pty)
  |-- HTTP server (hooks + OTLP receiver, localhost ephemeral port)
  |-- Persistence (JSON files in userData)
  |-- IPC handlers
  |
preload.ts (bridge)
  |-- contextBridge.exposeInMainWorld()
  |
renderer.ts (browser)
  |-- xterm.js terminal
  |-- Side panel UI (tools, cost, context, permissions)
  |-- Launch screen UI
```

Context isolation is enforced. `nodeIntegration: false`; all communication goes through the preload bridge. The renderer never has direct access to Node.js APIs.

---

## 4. File Structure

```
src/
  main.ts              -- Electron main process
  preload.ts           -- Context isolation bridge
  renderer.ts          -- All UI logic
  types.d.ts           -- TypeScript interfaces for IPC APIs
  electron-squirrel-startup.d.ts  -- Type shim

index.html             -- Single HTML file with all CSS inline
forge.config.ts        -- Electron Forge configuration
vite.main.config.ts    -- Vite config for main process
vite.preload.config.ts -- Vite config for preload
vite.renderer.config.ts -- Vite config for renderer
tsconfig.json
package.json

plugins/
  PANEL_PLUGIN_AUTHORING.md
  example-panel/
    panel-plugin.json
    index.js
```

---

## 5. Launch Screen

On startup, a full-screen overlay (`#launch-screen`) is shown over the terminal. It contains a 480px-wide card with:

### 5.1 Working Directory

- A display showing the current path (defaults to `(current directory)`)
- An "Open Folder" button that opens `dialog.showOpenDialog` with `openDirectory` property
- A "Recent folders" list below, populated from `recent-folders.json`
- Each recent folder shows a colored dot if it has a saved accent color
- Clicking a recent folder selects it and loads its settings

### 5.2 Accent Colour

A native `<input type="color">` defaulting to `#333333`, plus a "Reset" button that returns to the default. The selected color is applied to the OS window chrome on all three platforms, using different mechanisms per platform:

- **Windows**: `mainWindow.setAccentColor()` sets the native window border color (Windows 11 API). `titleBarOverlay` with `color` and `symbolColor` properties styles the titlebar background and window control icons.
- **macOS**: `titleBarStyle: 'hiddenInset'` hides the native titlebar while keeping the traffic lights (close/minimise/maximise) in their standard inset position. A custom HTML `<div class="titlebar">` sits behind the traffic lights and is styled with the chosen accent color via CSS. The div uses `-webkit-app-region: drag` so it remains draggable. `titleBarOverlay` with `height` (but not `color`, which macOS does not support) ensures the traffic lights are correctly positioned.
- **Linux**: `titleBarOverlay` with `color` and `symbolColor` properties, same as Windows.

The implementation checks `process.platform` at window creation time to apply the correct strategy. The color is persisted per folder.

### 5.3 Launch Options

A 2-column grid of structured controls:

| Control | Type | CLI flag |
|---|---|---|
| Resume last session | Toggle (checkbox styled as switch) | `--resume` |
| Continue conversation | Toggle | `--continue` |
| Model | Dropdown: (default), Opus, Sonnet, Haiku | `--model <value>` |
| Effort | Dropdown: (default), Low, Medium, High, Max | `--effort <value>` |
| Permission mode | Dropdown (spans 2 cols): (default), Auto, Accept edits, Plan, Bypass permissions | `--permission-mode <value>` |
| Additional arguments | Text input | Raw split on whitespace |

- Resume and Continue are mutually exclusive (checking one unchecks the other)
- All options persisted per folder under `launchOptions` in folder settings

### 5.4 Plugins

- A "Plugins" section with a "Browse..." button opening a directory picker
- Selected plugins shown as removable chips with path and × button
- Recent plugins list below (global, not per-folder) showing unselected recent entries that can be clicked to add
- Each selected plugin becomes `--plugin-dir <path>` at launch
- Active selection persisted per folder; recent list persisted globally

### 5.5 Launch Behaviour

When "Start Claude" is clicked (or Enter pressed in the args field):

1. Save accent color, launch options (including plugin dirs) to folder settings
2. Save selected plugins to global recent plugins list
3. Hide the launch screen
4. Use `requestAnimationFrame` to defer the actual launch, ensuring the terminal container has reflowed and `fitAddon.fit()` gets correct dimensions
5. Fit the terminal, send resize to main, spawn Claude with assembled args

### 5.6 Initial Args from CLI

The app supports passing args via:

- `CLAUDE_ARGS` environment variable (space-separated)
- Args after `--` separator in `process.argv`

These are pre-filled into the "Additional arguments" text field.

---

## 6. Terminal

### 6.1 Configuration

```javascript
Terminal({
  cursorBlink: true,
  fontSize: 14,
  fontFamily: 'Cascadia Code, Consolas, monospace',
  theme: { background: '#1e1e1e', foreground: '#cccccc' }
})
```

### 6.2 Resize Handling

- FitAddon auto-fits the terminal to its container
- Both `window.resize` and a `ResizeObserver` on the container trigger fit
- After fit, `terminal.resize` IPC sends new cols/rows to main process
- Main process stores `termCols`/`termRows` for PTY spawn and calls `ptyProcess.resize()`

### 6.3 Clipboard

- **Ctrl+V** (Windows/Linux) / **Cmd+V** (macOS): Intercepted via `attachCustomKeyEventHandler`, reads clipboard and sends to PTY as input data
- **Right-click**: Captured in capture phase on the terminal container. If there's a selection, copies it to clipboard. Otherwise, pastes from clipboard.

The key handler checks `process.platform` to determine the correct modifier key:

```typescript
const pasteKey = process.platform === 'darwin' ? 'v' : 'v';
const pasteModifier = process.platform === 'darwin' ? e.metaKey : e.ctrlKey;
```

### 6.4 File Drag and Drop

- Global `dragover`/`drop` listeners prevent Electron's default file navigation
- Terminal container gets `dragenter`/`dragleave`/`drop` handlers
- Visual feedback: `.drag-over` class adds a dashed green border overlay with "Drop files here" text
- On drop, file paths extracted via `webUtils.getPathForFile()` (required because `File.path` is unavailable with context isolation)
- Paths joined with spaces and sent to PTY as input text

### 6.5 PTY Output Scanning

The main process scans PTY output for the `\u276f` character (heavy right-pointing angle, Claude Code's prompt marker). When detected and the window is unfocused, the app notifies the user via platform-appropriate attention mechanisms:

- **Windows**: `mainWindow.flashFrame(true)` flashes the taskbar icon
- **macOS**: `mainWindow.flashFrame(true)` bounces the dock icon
- **Linux**: `mainWindow.flashFrame(true)` (behaviour depends on the desktop environment)

---

## 7. Side Panel

A 350px right sidebar (`#panel`) with a dark background (`#181818`). It contains a toggle bar and four draggable/hideable sections. The panel system is extensible; see §20 for the plugin framework that allows third-party panels to be registered alongside the built-in four.

### 7.1 Panel Toggles

A row of small buttons at the top, one per section (Perm, Cost, Ctx, Tools). Clicking toggles visibility. Active buttons have a highlighted style. Order matches current panel order.

### 7.2 Panel Reorder

Section headers have `draggable="true"`. Native HTML5 drag-and-drop on section headers reorders sections. The `dragover` handler shows a visual indicator on the target section. On drop, the internal order array is updated and sections are re-appended to the DOM in new order.

### 7.3 Panel Layout Persistence

The panel order and hidden set are saved per folder as:

```typescript
{ order: string[], hidden: string[] }
```

Section IDs: `permissions`, `cost`, `context`, `tools`.

---

## 8. Permissions Panel

### 8.1 Auto-Approval

These tools are always auto-approved (immediate HTTP 200 allow response): `Read`, `Glob`, `Grep`, `TodoRead`, `TodoWrite`.

Additionally, tools the user has approved "for session" are added to `sessionApprovedTools` (in-memory set, resets on app exit).

### 8.2 Permission Flow

1. Claude sends a `PreToolUse` hook event via HTTP POST
2. If not auto-approved, the HTTP response is held open (up to 5 minutes)
3. A permission card appears in the sidebar showing:
   - Tool name (bold)
   - Target (file path, command, pattern, etc.) in monospace
   - Three buttons: **Allow** (green), **Allow for session** (blue), **Deny** (red)
4. User clicks a button:
   - **Allow**: HTTP response with `permissionDecision: 'allow'`
   - **Allow for session**: Same, plus tool added to `sessionApprovedTools`
   - **Deny**: HTTP response with `permissionDecision: 'deny'`
5. Card updates to show result (reduced opacity, colored left border)

### 8.3 Timeout

After 5 minutes with no decision, the permission auto-denies with reason `"Timed out waiting for user decision"`. Card shows "Timed out" in gray.

### 8.4 App Closure

All pending permissions are denied with reason `"Application closed"`.

### 8.5 Section Visibility

The permissions section is hidden (`display: none`) by default and only shown when the first permission request arrives (`has-requests` class).

### 8.6 Attention Signal

When a permission request arrives and the window is unfocused, `mainWindow.flashFrame(true)` is called. See §6.5 for per-platform behaviour.

---

## 9. Tool Calls Panel

Displays a live feed of all tool invocations (scrollable, newest first).

### 9.1 Tool Event Card

Each card shows:

- Header row: Timestamp (HH:MM:SS), tool name (bold), status badge
- Target line: Context-dependent summary (see below)
- Expandable details: Click to toggle. Shows formatted JSON input and, after completion, the response (truncated to 500 chars)

### 9.2 Target Extraction

| Tool | Target shown |
|---|---|
| Read, Edit, Write | `file_path` |
| Bash | `command` |
| Glob, Grep | `pattern` |
| WebFetch | `url` |
| WebSearch | `query` |
| Agent | First 80 chars of `prompt` |
| Other | First 80 chars of JSON-stringified input |

### 9.3 Status Badges

- `running` (orange) — PreToolUse received, waiting for completion
- `done` (green) — PostToolUse received
- `failed` (red) — PostToolUseFailure received

---

## 10. Cost Panel

### 10.1 Summary

- Large total cost display (e.g. `$1.23` or `$0.0042` for small amounts)
- Grid of running totals: Input tokens, Output tokens, Cache read, Cache write, Request count

### 10.2 API Request Log

A scrollable list (max 150px) of individual API requests showing: timestamp, model name, and cost per request.

### 10.3 Token Formatting

Numbers formatted with `toLocaleString('en-US')` for thousand separators. Costs: 2 decimal places if >= `$0.01`, 4 decimal places otherwise.

---

## 11. Context Panel

### 11.1 Progress Bar

A horizontal bar showing context usage as a percentage of the model's context window. Color-coded:

- Blue (default): < 70%
- Orange (`.warn`): 70–89%
- Red (`.critical`): >= 90%

### 11.2 Context Calculation

Total context = `input_tokens + cache_read_tokens + cache_creation_tokens` (all three contribute to the actual context window consumption).

### 11.3 Model Context Limits

```typescript
'claude-opus-4-6':    200_000
'claude-sonnet-4-6':  200_000
'claude-haiku-4-5':   200_000
// Default:           200_000
```

Model matching uses `model.includes(key)` so partial model IDs work.

### 11.4 Stats Line

Below the bar: `<used> tokens <pct>% / <max>`

---

## 12. HTTP Server (Hooks + OTLP)

A single HTTP server on `127.0.0.1` with an ephemeral port (`:0`).

### 12.1 Endpoints

| Path | Purpose |
|---|---|
| `POST /v1/logs` | OTLP log receiver for telemetry |
| `POST /v1/*` | Other OTLP endpoints (ignored, 200 OK) |
| `POST /hooks` | Claude Code hook events |
| Other methods | 405 Method Not Allowed |

### 12.2 OTLP Log Parsing

Expects the OTLP/HTTP JSON format:

```
body.resourceLogs[].scopeLogs[].logRecords[].attributes[]
```

Filters for records where `attributes[event.name] === 'api_request'`. Extracts: `model`, `cost_usd`, `duration_ms`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`.

Attribute values can be `stringValue`, `intValue`, `doubleValue`, or `boolValue`. The parser handles all four.

### 12.3 Hook Events

**PreToolUse**: The critical event. Determines whether to auto-approve or hold the HTTP response for user decision. Response format:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow | deny",
    "permissionDecisionReason": "string"
  }
}
```

**PostToolUse / PostToolUseFailure**: Forwarded to renderer for the tool feed. Responded with `200 {}`.

### 12.4 Settings Injection

The hook server port is injected into Claude's configuration via the `--settings` CLI flag. The app builds a JSON settings object:

```json
{
  "hooks": {
    "PreToolUse": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:PORT/hooks" }] }],
    "PostToolUse": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:PORT/hooks" }] }],
    "PostToolUseFailure": [{ "hooks": [{ "type": "http", "url": "http://127.0.0.1:PORT/hooks" }] }]
  }
}
```

If the user also passes `--settings` in their args, the two are merged: the user's hooks are preserved and the app's hooks are appended. The user's `--settings` arg is filtered out and replaced with the merged version.

---

## 13. PTY Configuration

### 13.1 Claude Path Resolution

The app resolves the Claude CLI path in a platform-aware way:

```typescript
function findClaudePath(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const candidates: string[] = [];

  if (process.platform === 'win32') {
    candidates.push(path.join(home, '.local', 'bin', 'claude.exe'));
    candidates.push('claude.exe');
  } else {
    // macOS and Linux
    candidates.push(path.join(home, '.local', 'bin', 'claude'));
    candidates.push('/usr/local/bin/claude');
    candidates.push('/opt/homebrew/bin/claude'); // macOS Apple Silicon
  }

  candidates.push('claude'); // final fallback: rely on PATH
  return candidates.find(p => existsSync(p)) ?? 'claude';
}
```

### 13.2 Spawn Parameters

```typescript
pty.spawn(claudePath, finalArgs, {
  name: 'xterm-256color',
  cols: termCols,    // tracked from renderer resize events
  rows: termRows,
  cwd: currentCwd,  // user's selected folder
  env: {
    ...process.env,
    CLAUDE_CODE_ENABLE_TELEMETRY: '1',
    OTEL_LOGS_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
    OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: 'http://127.0.0.1:PORT/v1/logs'
  }
})
```

### 13.3 Arguments Assembly

Final args are built from structured launch options:

```
[--resume] [--continue] [--model X] [--effort X]
[--permission-mode X] [--plugin-dir P]... [extra args...]
--settings '<merged JSON>'
```

### 13.4 Exit Handling

On PTY exit, the exit code is sent to the renderer which displays `[Claude exited with code N]` in gray. If the app is quitting (`quitting` flag set during `window-all-closed`), `app.quit()` is called after PTY exits.

---

## 14. Persistence

Three JSON files stored in `app.getPath('userData')`:

### 14.1 recent-folders.json

```typescript
string[]  // max 10 entries, most recent first
```

Updated when Claude is spawned with a working directory.

### 14.2 recent-plugins.json

```typescript
string[]  // max 20 entries, most recent first
```

Updated when Claude is launched with plugin directories. Deduplicated (moved to front if already present).

### 14.3 folder-settings.json

```typescript
Record<string, {
  accentColor?: string,           // hex color or undefined
  panelLayout?: {
    order: string[],              // section IDs
    hidden: string[]              // hidden section IDs
  },
  launchOptions?: {
    resume?: boolean,
    continue?: boolean,
    model?: string,               // 'opus' | 'sonnet' | 'haiku'
    effort?: string,              // 'low' | 'medium' | 'high' | 'max'
    permissionMode?: string,      // 'auto' | 'acceptEdits' | 'plan' | 'bypassPermissions'
    pluginDirs?: string[],
    extraArgs?: string
  }
}>
```

The key is the folder path. For the default directory (no folder selected), the key is an empty string `""`.

Settings are saved via a generic helper:

```typescript
saveFolderSetting<K extends keyof FolderSettings>(folder, key, value)
```

---

## 15. IPC Channel Reference

### Main → Renderer (events)

| Channel | Payload | Purpose |
|---|---|---|
| `terminal:data` | `string` | PTY output |
| `terminal:exit` | `number` | PTY exit code |
| `hook:tool-event` | `ToolEvent` | Tool call events from hooks |
| `telemetry:api-request` | `ApiRequestEvent` | Parsed OTLP API request |
| `permission:request` | `PermissionRequestEvent` | New permission card |
| `permission:timeout` | `string (id)` | Permission timed out |

### Renderer → Main (send, fire-and-forget)

| Channel | Payload | Purpose |
|---|---|---|
| `terminal:ready` | none | Renderer initialized |
| `terminal:input` | `string` | User keyboard input |
| `terminal:resize` | `cols, rows` | Terminal resized |
| `terminal:launch` | `string[], string?` | Start Claude with args and cwd |
| `folders:set-accent-color` | `string, string?` | Save accent color |
| `folders:set-panel-layout` | `string, PanelLayout` | Save panel layout |
| `folders:set-launch-options` | `string, LaunchOptions` | Save launch options |
| `plugins:add-recent` | `string[]` | Add to recent plugins |
| `window:set-accent-color` | `string \| null` | Apply accent color |
| `permission:decision` | `id, behavior, toolName` | User's permission choice |

### Renderer → Main (invoke, returns Promise)

| Channel | Returns | Purpose |
|---|---|---|
| `clipboard:read` | `string` | Read clipboard |
| `clipboard:write` | `void` | Write to clipboard |
| `terminal:get-args` | `string[]` | Get initial CLI args |
| `folders:pick` | `string \| null` | Open folder picker dialog |
| `folders:get-recent` | `string[]` | Get recent folders |
| `folders:get-settings` | `FolderSettings` | Get settings for folder |
| `folders:get-all-settings` | `Record<string, FolderSettings>` | Get all folder settings |
| `plugins:pick-dir` | `string \| null` | Open directory picker |
| `plugins:get-recent` | `string[]` | Get recent plugins |

---

## 16. Window Configuration

```typescript
BrowserWindow({
  width: 1400,
  height: 800,
  autoHideMenuBar: true,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false
  }
})
```

- Application menu is set to `null` (no menu bar)
- **F12** toggles DevTools (via `before-input-event` listener)
- `flashFrame(true)` called on permission requests and PTY prompt detection when window is unfocused (see §6.5 for per-platform behaviour)

---

## 17. Visual Design

### Colour Palette

| Usage | Color |
|---|---|
| Background (terminal) | `#1e1e1e` |
| Background (panel) | `#181818` |
| Background (inputs/cards) | `#2a2a2a` |
| Border | `#333` / `#444` |
| Text primary | `#e0e0e0` |
| Text secondary | `#cccccc` |
| Text muted | `#888` / `#666` |
| Text dim | `#555` |
| Success / allow | `#4ec94e` (green) |
| Warning / pending | `#e8a838` (orange) |
| Error / deny | `#e84e4e` (red) |
| Info / context bar | `#4eb8e8` (blue) |
| Session approve | `#4eb8e8` (blue) |

### Typography

- UI text: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Code/values: `'Cascadia Code', Consolas, monospace`
- Terminal: `'Cascadia Code', Consolas, monospace` at 14px

### Component Patterns

- **Toggle switches**: Custom checkbox with `appearance: none`, styled as 32×18px pill with sliding 14px circle. Green when checked.
- **Select dropdowns**: Dark background, monospace font, subtle border.
- **Plugin chips**: Inline-flex with path text (ellipsis) and × remove button.
- **Permission cards**: Left-colored border (orange=pending, green=allowed, red=denied, gray=timeout). Resolved cards at 50% opacity.
- **Panel headers**: Uppercase, letter-spaced, draggable with grab cursor.
- **Scrollbars**: 6px wide, transparent track, `#444` thumb, rounded.

---

## 18. Key Behaviours and Edge Cases

**Terminal initial sizing**: Claude draws its welcome box based on initial terminal size. The PTY must not be spawned until after `fitAddon.fit()` runs with correct dimensions. Solved with `requestAnimationFrame` deferral.

**Settings key for default directory**: When no folder is selected, the settings key is an empty string `""`, not `null`. This ensures default-directory settings are properly saved and recalled.

**Resume vs Continue exclusivity**: Checking one toggle unchecks the other in the renderer via `change` event listeners.

**Settings merge**: User's `--settings` flag is extracted from args, parsed, merged with hook configuration, and re-injected. Invalid user JSON falls back to hooks-only settings.

**PTY resize safety**: `ptyProcess.resize()` is wrapped in try/catch because it throws if the process has already exited.

**Recent lists deduplication**: Both recent folders and recent plugins remove existing entries before prepending, preventing duplicates.

**App shutdown sequence**: `window-all-closed` sets `quitting` flag, denies all pending permissions, closes hook server, kills PTY. After PTY exits (via `onExit` handler), `app.quit()` is called.

---

## 19. Platform Notes

Gada Terminal targets Windows, macOS, and Linux. The following table summarises all platform-specific behaviour:

| Feature | Windows | macOS | Linux |
|---|---|---|---|
| Installer format | Squirrel (`.exe`) | DMG (`.dmg`) | DEB / RPM |
| Window accent color | `setAccentColor()` for border; `titleBarOverlay` `color` + `symbolColor` for titlebar | `titleBarStyle: 'hiddenInset'` + custom HTML titlebar div styled with accent color; `titleBarOverlay` `height` only | `titleBarOverlay` `color` + `symbolColor` (same as Windows) |
| Taskbar/dock attention | `flashFrame(true)` — flashes taskbar | `flashFrame(true)` — bounces dock icon | `flashFrame(true)` — DE-dependent |
| Claude path candidates | `%USERPROFILE%\.local\bin\claude.exe` | `~/.local/bin/claude`, `/opt/homebrew/bin/claude` | `~/.local/bin/claude`, `/usr/local/bin/claude` |
| Paste shortcut | Ctrl+V | Cmd+V | Ctrl+V |
| Home directory env var | `USERPROFILE` (fallback: `HOME`) | `HOME` | `HOME` |

All other subsystems (xterm.js, node-pty, HTTP server, IPC, persistence via `app.getPath('userData')`) are cross-platform and require no conditional logic.

---

## 20. Panel Plugin Framework

The side panel system is designed to be extensible. Third-party developers can register additional panels that appear alongside the built-in Permissions, Cost, Context, and Tools panels.

### 20.1 Plugin Discovery

At startup, the main process scans for panel plugins in two locations (in order):

- `<userData>/plugins/panels/` — user-installed plugins
- Any directories passed via `--panel-plugin-dir <path>` CLI flag

Each plugin is a directory containing a `panel-plugin.json` manifest and an `index.js` entry file.

### 20.2 Manifest Format (`panel-plugin.json`)

```json
{
  "id": "my-panel",
  "name": "My Panel",
  "version": "1.0.0",
  "description": "What this panel shows",
  "entry": "index.js",
  "permissions": ["hook:tool-event", "telemetry:api-request"]
}
```

`permissions` declares which IPC event streams the plugin wants to receive. The main process only forwards declared event types to each plugin's renderer.

### 20.3 Plugin Entry File (`index.js`)

The entry file is loaded in the renderer inside a sandboxed `<iframe>` with `sandbox="allow-scripts"`. It receives events and renders its own UI. Communication between the iframe and the host renderer uses `postMessage`:

```javascript
// Plugin receives events from host
window.addEventListener('message', (event) => {
  if (event.data.type === 'hook:tool-event') {
    const toolEvent = event.data.payload;
    // render your UI
  }
});

// Plugin sends resize hints to host
window.parent.postMessage({ type: 'panel:resize', height: 200 }, '*');
```

The host injects a `panel-api.js` shim into each iframe before loading the plugin, providing:

```javascript
window.PanelAPI = {
  version: '1',
  on(eventType, callback),   // subscribe to an event stream
  emit(eventType, payload),  // send events to other panels (scoped to plugin id)
  getTheme(),                // returns current CSS variable map
  setTitle(title),           // update panel header label
  setHeight(px),             // request panel height
};
```

### 20.4 Host Responsibilities

- Wrap each plugin panel in the same draggable section container as built-in panels
- Include plugin panels in the panel order/hidden persistence (keyed by plugin `id`)
- Forward only the IPC events the plugin declared in `permissions`
- Apply the global panel CSS variables (colours, fonts, scrollbar styles) to the iframe so plugins can inherit the theme
- Catch and log errors from plugin iframes without crashing the host

### 20.5 Built-in Panel IDs

The four built-in panels use reserved IDs that plugin authors must not reuse:

| ID | Panel |
|---|---|
| `permissions` | Permissions |
| `cost` | Cost |
| `context` | Context |
| `tools` | Tools |

### 20.6 Developer Documentation

A `PANEL_PLUGIN_AUTHORING.md` file is shipped with the application (and available in the repo) covering: the full `PanelAPI` reference, available event types and their payload shapes (matching the IPC channel reference in §15), the CSS variables exposed for theming, the manifest schema, and a minimal working example plugin.
