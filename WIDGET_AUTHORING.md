# Widget Authoring Guide

Gada Terminal supports widgets — small JavaScript bundles that render
inside sandboxed iframes in the sidebar. Widgets can subscribe to live session
events and, with user approval, perform write operations in the host app.

---

## Widget structure

A widget is a directory containing two files:

```
my-widget/
  widget.json   ← manifest
  index.js      ← entry point
```

Place it in either:
- `<userData>/widgets/my-widget/` — persists across app updates
- `<appPath>/widgets/my-widget/` — bundled with the app

---

## Manifest — `widget.json`

```json
{
  "id": "my-widget",
  "name": "My Widget",
  "version": "1.0.0",
  "description": "What this widget does.",
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
| `entry` | Yes | Filename of the entry script relative to the widget directory. |
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

A widget that attempts to use a capability not listed in its manifest receives
an error immediately — no approval prompt is shown.

---

## WidgetAPI reference

The global `window.WidgetAPI` object is injected into every widget iframe.

### Read methods (no approval required)

#### `WidgetAPI.on(eventType, callback)`

Subscribe to an event stream. The widget must declare the corresponding
`permissions` entry in its manifest or the event will never fire.

```js
WidgetAPI.on('hook:tool-event', function(event) {
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

#### `WidgetAPI.getContext()` → `Promise<string>`

Returns the working directory selected on the launch screen for the active
session. Use this to scope data or commands to the current project.

```js
WidgetAPI.getContext().then(function(cwd) {
  console.log('Project folder:', cwd);
});
```

No capability declaration required. No approval prompt. Returns an empty
string if called before a session is started.

#### `WidgetAPI.getTheme()`

Returns the current UI theme as a plain object.

```js
var theme = WidgetAPI.getTheme();
// { background, backgroundSecondary, textPrimary, textMuted,
//   accent, fontUi, fontMono }
```

#### `WidgetAPI.setTitle(title)`

Updates the panel's header title text.

```js
WidgetAPI.setTitle('My Widget (3)');
```

#### `WidgetAPI.setHeight(px)`

Resizes the widget iframe to the given pixel height.

```js
WidgetAPI.setHeight(200);
```

#### `WidgetAPI.emit(eventType, payload)`

Broadcasts a custom event to all other loaded widget iframes. The receiving
widget must subscribe with `WidgetAPI.on(eventType, ...)`. No manifest
declaration required; no approval needed. Events do not leave the renderer.

```js
WidgetAPI.emit('my-widget:update', { count: 42 });
```

### Write methods (require `capabilities` declaration + user approval)

All write methods return a `Promise`. The promise is held until the user
approves or denies the capability. Once approved, subsequent calls in the
same session (or permanently, if the user chose "Allow") resolve immediately.

If the user denies, the promise rejects with `Error('Permission denied')`.
If the capability is not declared in the manifest, the promise rejects
immediately with an error.

#### `WidgetAPI.sendTerminalInput(text)` → `Promise<void>`

Requires `"terminal:write"` capability.

Sends raw text to the terminal PTY, exactly as if the user typed it.

```js
WidgetAPI.sendTerminalInput('ls -la\n').then(function() {
  console.log('sent');
});
```

#### `WidgetAPI.sendClaudeMessage(text)` → `Promise<void>`

Requires `"claude:message"` capability.

Sends `text + newline` to the terminal, submitting it as a message to Claude.

```js
WidgetAPI.sendClaudeMessage('Summarise the last tool output.');
```

#### `WidgetAPI.spawnProcess(cmd, args?)` → `Promise<{ stdout, stderr, exitCode }>`

Requires `"process:spawn"` capability.

Spawns a child process and resolves with combined output. Timeout: 10 seconds.

```js
WidgetAPI.spawnProcess('git', ['log', '--oneline', '-5']).then(function(r) {
  console.log(r.stdout);
});
```

#### `WidgetAPI.httpRequest(url, options?)` → `Promise<{ status, body }>`

Requires `"http:request"` capability.

Makes an HTTP or HTTPS request. `body` is the raw response string.

```js
WidgetAPI.httpRequest('https://api.example.com/data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'value' }),
}).then(function(r) {
  console.log(r.status, r.body);
});
```

---

## Approval flow

When a widget calls a write method for the first time:

1. An approval card appears in the **Permissions** sidebar panel.
2. The card shows the widget name and the capability being requested.
3. The promise is held until the user responds.

| Button | Behaviour |
|---|---|
| **Allow** | Executes the operation. Persists the grant — the widget will not be prompted again after restart. |
| **Session** | Executes the operation. Grant is in-memory only — the widget will be prompted again after restart. |
| **Deny** | Rejects the promise with `Error('Permission denied')`. The widget will be prompted again next time it tries. |

Grants are stored per-widget per-capability in `folder-settings.json` under
the current working directory key.

---

## Sandbox constraints

Widget code runs in a `sandbox="allow-scripts"` iframe with no access to:
- The parent window DOM
- The filesystem
- Node.js APIs
- External URLs via `<script src>` or `<link href>`

All external I/O must go through `WidgetAPI` write methods, which require
explicit user approval.

---

## Step-by-step example

**Goal:** A widget that shows a button. Clicking it sends `"pwd\n"` to the
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
    window.WidgetAPI.sendTerminalInput('pwd\n')
      .then(function () { btn.disabled = false; })
      .catch(function (err) {
        btn.textContent = err.message;
        btn.disabled = false;
      });
  });
})();
```

### 3. Install

Copy the folder to `<userData>/widgets/pwd-button/` and restart the app.

### 4. First run

Click the button. An approval card appears in the Permissions panel:

> **PWD** · widget  
> Requesting: Write to terminal  
> [Allow] [Session] [Deny]

Click **Allow**. The command runs and the grant is saved — no more prompts.
