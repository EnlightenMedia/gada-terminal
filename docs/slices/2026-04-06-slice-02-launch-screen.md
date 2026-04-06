# Slice 2 — Launch Screen

**Status:** complete
**Observable result:** Before Claude starts, a GUI card lets you pick a working directory (with recent folders), choose model/effort/permission mode/extra args, and click "Start Claude". Settings persist per folder between sessions.

---

## Files

| File | Change |
|---|---|
| `src/types.d.ts` | Add `LaunchOptions`, `FolderSettings` interfaces; extend `Window.electronAPI` |
| `src/persistence.ts` | New — JSON load/save helpers for userData files |
| `src/main.ts` | Remove auto-spawn; add folder/settings IPC handlers; update recent folders on launch |
| `src/preload.ts` | Expose new IPC channels for folders, settings, initial args |
| `src/renderer.ts` | Add launch screen controller; `requestAnimationFrame` deferral on launch |
| `index.html` | Add `#launch-screen` HTML + all CSS |

---

## Build steps

- [x] Step 1 — Type definitions: add `LaunchOptions`, `FolderSettings`, new `electronAPI` methods; verify `tsc --noEmit`
- [x] Step 2 — Persistence module: `src/persistence.ts` with JSON helpers; verify returns `[]` on first run
- [x] Step 3 — Main process: remove auto-spawn from `terminal:resize`; add all new IPC handlers
- [x] Step 4 — Preload bridge: expose new methods; verify via DevTools console
- [x] Step 5 — HTML + CSS: launch card visible and styled; terminal hidden behind overlay
- [x] Step 6 — Launch screen controller: init, folder picker, recent list, options, accent color, launch
- [x] Step 7 — Recent folders persistence: launching with a folder adds it to the recent list on next open
- [x] Step 8 — Initial args from CLI: `CLAUDE_ARGS` env var and `--` argv separator pre-fill extra args field

---

## Key decisions

1. **Plugins excluded**: plugin section (§5.4) is deferred to Slice 6.
2. **Accent color on OS window chrome excluded**: the color picker updates CSS only; OS chrome APIs are Slice 6.
3. **`window:set-accent-color` IPC**: registered in main as a no-op stub so the renderer call doesn't error.
4. **Empty-string folder key**: `selectedFolder ?? ''` (not `||`) ensures default-directory settings are stored under `""`.
5. **`requestAnimationFrame` deferral**: launch screen hides first, then rAF fires `fitAddon.fit()` → `sendResize` → `launchClaude` so PTY gets correct terminal dimensions.

---

## Critical interaction with Slice 1

The auto-spawn block in `terminal:resize` (main.ts) **must be deleted**:
```typescript
// DELETE THIS:
} else if (!claudeSpawned) {
  const cwd = process.cwd();
  spawnClaude([], cwd);
}
```
If left in, Claude spawns immediately on first resize before the launch screen appears.

---

## Edge cases

- **Resume/Continue exclusivity**: checking one unchecks the other via `change` listeners.
- **Settings key `""`**: default directory settings stored under empty string, not null.
- **`CLAUDE_ARGS` parsing**: split on `/\s+/`, filter empty strings.
- **`--` in argv**: `process.argv.indexOf('--')` + slice; empty if not found.
- **userData JSON files missing on first run**: `loadJSON` catches `ENOENT` and returns the default value.
