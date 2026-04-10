# Panel Plugin Authoring Guide

Gada Terminal supports panel plugins — small JavaScript bundles that render
inside sandboxed iframes in the sidebar. Plugins can subscribe to live session
events and, with user approval, perform write operations in the host app.

---

## Plugin structure

A plugin is a directory containing two files:

```
my-plugin/
  panel-plugin.json   ← manifest
  index.js            ← entry point
```

Place it in either:
- `<userData>/plugins/panels/my-plugin/` — persists across app updates
- A custom directory selected from the launch screen plugin picker

---

## Manifest — `panel-plugin.json`

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "What this plugin does.",
  "entry": "index.js",
  "permissions": ["hook:tool-event"],
  "capabilities": ["terminal:write"]
}
```

| Field | Required | Description |
|---|---|---|
| `id` | Yes | Unique identifier (alphanumeric, hyphens). Must be stable across versions. |
| `name` | Yes | Display name shown in the sidebar header and toggle bar. |
| `version` | No | Semver string. Defaults to `0.0.0`. |
| `description` | No | Human-readable description. |
| `entry` | Yes | Filename of the entry script relative to the plugin directory. |
| `permissions` | No | Read-only event subscriptions. Array of event type strings. |
| `capabilities` | No | Write operations requiring user approval. Array of capability strings. |

### `permissions` — read-only event subscriptions

These are granted automatically with no approval prompt.

| Value | Payload type | Description |
|---|---|---|
| `hook:tool-event` | `ToolEvent` | Fired before and after every tool Claude invokes. |
| `hook:api-request` | `ApiRequestEvent` | Fired after every Claude API response with token counts and cost. |

### `capabilities` — write operations

These require the user to approve the first use. Grants can be permanent
(survive restart) or session-only.

| Value | Description |
|---|---|
| `terminal:write` | Write raw text to the terminal (as if the user typed it). |
| `claude:message` | Send a complete message to Claude (text + newline). |
| `process:spawn` | Spawn a child process and capture stdout/stderr. |
| `http:request` | Make an outbound HTTP/HTTPS request. |

A plugin that attempts to use a capability not listed in its manifest receives
an error immediately — no approval prompt is shown.

---

## PanelAPI reference

The global `window.PanelAPI` object is injected into every plugin iframe.

### Read methods (no approval required)

#### `PanelAPI.on(eventType, callback)`

Subscribe to an event stream. The plugin must declare the corresponding
`permissions` entry in its manifest or the event will never fire.

```js
PanelAPI.on('hook:tool-event', function(event) {
  console.log(event.toolName, event.event);
});
```

**ToolEvent shape:**
```js
{
  id: string,
  event: 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure',
  toolName: string,
  input: object,
  output: string | undefined,
  error: string | undefined,
  timestamp: number,   // Unix ms
}
```

**ApiRequestEvent shape:**
```js
{
  timestamp: number,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
  costUsd: number,
  durationMs: number,
}
```

#### `PanelAPI.getTheme()`

Returns the current UI theme as a plain object.

```js
var theme = PanelAPI.getTheme();
// { background, backgroundSecondary, textPrimary, textMuted,
//   accent, fontUi, fontMono }
```

#### `PanelAPI.setTitle(title)`

Updates the panel's header title text.

```js
PanelAPI.setTitle('My Plugin (3)');
```

#### `PanelAPI.setHeight(px)`

Resizes the plugin iframe to the given pixel height.

```js
PanelAPI.setHeight(200);
```

#### `PanelAPI.emit(eventType, payload)`

Broadcasts a custom event to all other loaded plugin iframes. The receiving
plugin must subscribe with `PanelAPI.on(eventType, ...)`. No manifest
declaration required; no approval needed. Events do not leave the renderer.

```js
PanelAPI.emit('my-plugin:update', { count: 42 });
```

### Write methods (require `capabilities` declaration + user approval)

All write methods return a `Promise`. The promise is held until the user
approves or denies the capability. Once approved, subsequent calls in the
same session (or permanently, if the user chose "Allow") resolve immediately.

If the user denies, the promise rejects with `Error('Permission denied')`.
If the capability is not declared in the manifest, the promise rejects
immediately with an error.

#### `PanelAPI.sendTerminalInput(text)` → `Promise<void>`

Requires `"terminal:write"` capability.

Sends raw text to the terminal PTY, exactly as if the user typed it.

```js
PanelAPI.sendTerminalInput('ls -la\n').then(function() {
  console.log('sent');
});
```

#### `PanelAPI.sendClaudeMessage(text)` → `Promise<void>`

Requires `"claude:message"` capability.

Sends `text + newline` to the terminal, submitting it as a message to Claude.

```js
PanelAPI.sendClaudeMessage('Summarise the last tool output.');
```

#### `PanelAPI.spawnProcess(cmd, args?)` → `Promise<{ stdout, stderr, exitCode }>`

Requires `"process:spawn"` capability.

Spawns a child process and resolves with combined output. Timeout: 10 seconds.

```js
PanelAPI.spawnProcess('git', ['log', '--oneline', '-5']).then(function(r) {
  console.log(r.stdout);
});
```

#### `PanelAPI.httpRequest(url, options?)` → `Promise<{ status, body }>`

Requires `"http:request"` capability.

Makes an HTTP or HTTPS request. `body` is the raw response string.

```js
PanelAPI.httpRequest('https://api.example.com/data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'value' }),
}).then(function(r) {
  console.log(r.status, r.body);
});
```

---

## Approval flow

When a plugin calls a write method for the first time:

1. An approval card appears in the **Permissions** sidebar panel.
2. The card shows the plugin name and the capability being requested.
3. The promise is held until the user responds.

| Button | Behaviour |
|---|---|
| **Allow** | Executes the operation. Persists the grant — the plugin will not be prompted again after restart. |
| **Session** | Executes the operation. Grant is in-memory only — the plugin will be prompted again after restart. |
| **Deny** | Rejects the promise with `Error('Permission denied')`. The plugin will be prompted again next time it tries. |

Grants are stored per-plugin per-capability in `folder-settings.json` under
the current working directory key.

---

## Sandbox constraints

Plugin code runs in a `sandbox="allow-scripts"` iframe with no access to:
- The parent window DOM
- The filesystem
- Node.js APIs
- External URLs via `<script src>` or `<link href>`

All external I/O must go through `PanelAPI` write methods, which require
explicit user approval.

---

## Step-by-step example

**Goal:** A plugin that shows a button. Clicking it sends `"pwd\n"` to the
terminal to print the current directory.

### 1. Create the manifest

```json
{
  "id": "pwd-button",
  "name": "PWD",
  "version": "1.0.0",
  "entry": "index.js",
  "permissions": [],
  "capabilities": ["terminal:write"]
}
```

### 2. Write the entry script

```js
(function () {
  var btn = document.createElement('button');
  btn.textContent = 'Print working directory';
  btn.style.cssText = 'padding:6px 10px;font-size:12px;cursor:pointer;width:100%;';
  document.body.appendChild(btn);

  btn.addEventListener('click', function () {
    btn.disabled = true;
    window.PanelAPI.sendTerminalInput('pwd\n')
      .then(function () { btn.disabled = false; })
      .catch(function (err) {
        btn.textContent = err.message;
        btn.disabled = false;
      });
  });
})();
```

### 3. Install

Copy the folder to `<userData>/plugins/panels/pwd-button/` and restart the app.

### 4. First run

Click the button. An approval card appears in the Permissions panel:

> **PWD** · plugin  
> Requesting: Write to terminal  
> [Allow] [Session] [Deny]

Click **Allow**. The command runs and the grant is saved — no more prompts.
