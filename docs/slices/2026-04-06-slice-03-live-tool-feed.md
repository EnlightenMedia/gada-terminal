# Slice 3 — Live Tool Feed

**Status:** complete
**Observable result:** A sidebar appears with a live feed of every tool Claude invokes — file reads, bash commands, web searches — each shown with a timestamp, target, and running/done/failed status badge.

---

## New files

| File | Purpose |
|---|---|
| `src/hookServer.ts` | HTTP server on ephemeral port; parses PreToolUse/PostToolUse/PostToolUseFailure; delegates to IPC callback |
| `src/settingsBuilder.ts` | Pure function: builds `--settings` JSON with hook URLs; merges with user-supplied `--settings` if present |

## Modified files

| File | Change |
|---|---|
| `src/types.d.ts` | Add `ToolEvent` interface; add `onToolEvent` to `electronAPI` |
| `src/main.ts` | Start hook server before window; inject `--settings` in `spawnClaude`; forward `hook:tool-event`; close server on shutdown |
| `src/preload.ts` | Expose `onToolEvent` subscription |
| `src/renderer.ts` | Panel toggle/hide/drag infrastructure; tool card rendering; `onToolEvent` subscription |
| `index.html` | `#panel` sidebar with toggle bar, 4 section stubs (Tools visible, others hidden), all CSS |

---

## Build steps

- [x] Step 1 — `src/hookServer.ts`: HTTP server, hook parsing, callback delegation
- [x] Step 2 — `src/settingsBuilder.ts`: `buildSettingsArgs(port, args)` with merge logic
- [x] Step 3 — `src/types.d.ts`: add `ToolEvent` and `onToolEvent`
- [x] Step 4 — `src/main.ts`: await hook server start; inject `--settings` in `spawnClaude`; forward events; close on shutdown
- [x] Step 5 — `src/preload.ts`: expose `onToolEvent`
- [x] Step 6 — `index.html`: sidebar HTML + all CSS
- [x] Step 7 — `src/renderer.ts`: panel toggle/hide/drag wiring
- [x] Step 8 — `src/renderer.ts`: tool card rendering and `onToolEvent` subscription

---

## Key decisions

1. **`hookPort` stays main-process-only**: renderer never knows the port; `buildSettingsArgs` runs in `spawnClaude` after the IPC hop.
2. **`tool_use_id` from hook payload**: used as the stable card ID so Pre and Post events correlate correctly.
3. **PreToolUse auto-approves in Slice 3**: always responds `{ permissionDecision: 'allow' }`. Slice 5 changes this to hold the response.
4. **Stub sections added now**: Permissions/Cost/Context sections exist as hidden stubs so Slice 4/5 needs no structural HTML changes.
5. **OTLP env vars deferred**: `CLAUDE_CODE_ENABLE_TELEMETRY` and friends are added in Slice 4 only.

---

## Edge cases

- **Invalid user `--settings` JSON**: `settingsBuilder.ts` catches parse errors and falls back to app-only hooks.
- **Hook server not ready**: awaited before `createWindow` returns; `terminal:launch` IPC cannot fire before renderer loads, which is after `createWindow`, so no race.
- **Shutdown**: `hookServerClose?.()` called in `window-all-closed` alongside PTY kill.
