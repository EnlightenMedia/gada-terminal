# Widget Authoring Guide

Widgets are small self-contained panels that appear in the sidebars.
Each widget is a directory under `widgets/` containing a `widget.json`
manifest and an `index.js` entry point.

---

## Manifest (`widget.json`)

```json
{
  "id": "my-widget",
  "name": "My Widget",
  "version": "1.0.0",
  "description": "What this widget does.",
  "entry": "index.js",
  "permissions": [],
  "capabilities": []
}
```

| Field | Purpose |
|-------|---------|
| `id` | Unique identifier. Used as storage namespace and section ID. |
| `name` | Display name shown in the panel header and widget settings. |
| `permissions` | Event types the widget subscribes to (e.g. `"hook:tool-event"`). |
| `capabilities` | Write capabilities the widget uses (see below). |

---

## `WidgetAPI`

The global `window.WidgetAPI` object is injected into every widget at load time.

### Read-only / event APIs (no approval required)

```js
// Subscribe to events
WidgetAPI.on('hook:tool-event', function(event) { /* ToolEvent */ });

// Get the current theme colours and fonts
var theme = WidgetAPI.getTheme();
// { background, backgroundSecondary, textPrimary, textMuted, accent, fontUi, fontMono }

// Get the active working directory (the folder selected on the launch screen)
WidgetAPI.getContext().then(function(cwd) { /* string */ });

// Change the panel header title
WidgetAPI.setTitle('My Title');

// Override the iframe height (px). Pass 0 to restore height:100%.
WidgetAPI.setHeight(200);
```

### Storage (no approval required)

Storage is scoped per widget ID and persists via `localStorage` in the
renderer. Widgets cannot access `localStorage` directly (opaque iframe origin).

```js
WidgetAPI.storage.get('key').then(function(value) { /* string | null */ });
WidgetAPI.storage.set('key', 'value').then(function() { /* done */ });
```

### Write capabilities (require user approval on first use)

Declare these in `capabilities` in `widget.json`. The user sees an approval
prompt the first time the capability is exercised; grants persist for the session.

```js
// Send text to the terminal (capability: "terminal:write")
WidgetAPI.sendTerminalInput('text');

// Send a message to Claude (capability: "claude:message")
WidgetAPI.sendClaudeMessage('Summarise the last response.');

// Run a process and get stdout/stderr (capability: "process:spawn")
WidgetAPI.spawnProcess('git', ['-C', '/path', 'status', '--short'])
  .then(function(result) {
    // result: { stdout: string, stderr: string, exitCode: number }
  });

// Make an HTTP request (capability: "http:request")
WidgetAPI.httpRequest('https://example.com/api', { method: 'GET' })
  .then(function(result) {
    // result: { status: number, body: string }
  });
```

### Dialogs

Open a full-window overlay dialog. The dialog script runs in its own
sandboxed iframe and has access to `DialogAPI` (see below).

```js
WidgetAPI.openDialog(scriptString).then(function(result) {
  // result: whatever DialogAPI.close() was called with, or null if dismissed
});
```

**Pattern — embed data into the script at call time:**

```js
var myData = { items: [1, 2, 3] };
var script = '(function(){\n' +
  '  var data = ' + JSON.stringify(myData) + ';\n' +
  '  // render dialog using data...\n' +
  '  window.DialogAPI.close({ updated: data });\n' +
  '})();';

WidgetAPI.openDialog(script).then(function(result) {
  if (result) { /* use result.updated */ }
});
```

Only one dialog can be open at a time globally. A second `openDialog` call
while one is already open is silently ignored.

---

## `DialogAPI`

Available as `window.DialogAPI` inside dialog scripts only.

```js
// Get the theme (same values as WidgetAPI.getTheme())
var theme = window.DialogAPI.getTheme();

// Close the dialog and resolve the widget's openDialog() promise
window.DialogAPI.close(result);   // result can be any serialisable value
window.DialogAPI.close(null);     // explicit null
// Clicking the backdrop also closes the dialog with null
```

The dialog does **not** have access to `WidgetAPI`. Pass any data the dialog
needs by embedding it in the script string before calling `openDialog`.
Return data to the widget via `DialogAPI.close(result)`.

---

## Events (`WidgetAPI.on`)

| Event type | Payload | Requires permission |
|-----------|---------|-------------------|
| `hook:tool-event` | `ToolEvent` | `"hook:tool-event"` in manifest |

### `ToolEvent`

```js
{
  id: string,
  event: 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure',
  toolName: string,
  input: object,
  output?: string,    // PostToolUse only
  error?: string,     // PostToolUseFailure only
  timestamp: number
}
```

---

## Sandbox

Widget and dialog iframes run with `sandbox="allow-scripts"` — no
`allow-same-origin`. This means:

- `localStorage`, `sessionStorage`, `indexedDB` all throw `SecurityError`
- Use `WidgetAPI.storage` instead
- `fetch` and `XMLHttpRequest` are blocked — use `WidgetAPI.httpRequest`
- `eval` works (allow-scripts), but is discouraged
