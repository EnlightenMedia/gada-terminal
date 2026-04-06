# Slice 1 — Working Terminal

**Status:** complete
**Observable result:** A Windows desktop app opens with a full-fidelity terminal running Claude via xterm.js + node-pty. The user can type, interact with Claude, copy/paste, drag files in, and the terminal resizes with the window.

---

## Files

| File | Purpose |
|---|---|
| `package.json` | Dependencies + Forge/Vite build scripts |
| `tsconfig.json` | ESNext/CommonJS, sourceMap, noImplicitAny |
| `forge.config.ts` | Squirrel maker, Vite plugin, ASAR, auto-unpack-natives |
| `vite.main.config.ts` | Marks `node-pty` as external (critical — prevents bundling the native binary) |
| `vite.preload.config.ts` | Empty defaults |
| `vite.renderer.config.ts` | Empty defaults |
| `index.html` | Full-height terminal container, all CSS inline, drag-over styles |
| `src/types.d.ts` | `window.electronAPI` TypeScript interface |
| `src/electron-squirrel-startup.d.ts` | Type shim |
| `src/main.ts` | Window creation, PTY spawn, IPC handlers, Claude path resolution |
| `src/preload.ts` | Context bridge exposing all Slice 1 IPC channels |
| `src/renderer.ts` | xterm.js, FitAddon, resize, clipboard, drag-and-drop |

---

## Build steps

- [x] Step 1 — Scaffold + `npm install`: verify `node_modules/node-pty/prebuilds/win32-x64/` exists (no compiler needed)
- [x] Step 2 — Config files + minimal main + placeholder HTML: `npm start` opens a window
- [x] Step 3 — xterm.js in renderer: terminal renders with correct dark theme, font, blinking cursor
- [x] Step 4 — Preload bridge + IPC skeleton: typing echoes back; F12 opens DevTools; resize reflows
- [x] Step 5 — Spawn Claude via node-pty: Claude's welcome banner appears; full interaction works
- [x] Step 6 — Resize correctness: drag window narrower; Claude's UI reflows cleanly
- [x] Step 7 — Clipboard: Ctrl+V pastes; right-click copies selection or pastes
- [x] Step 8 — Drag and drop: drop a file, path appears at prompt with green border feedback
- [x] Step 9 — Exit handling + taskbar flash: no orphan processes on close; taskbar flashes when Claude is ready and window is minimized

---

## Key decisions

1. **Working directory for Slice 1**: `process.cwd()` — hardcoded, replaced by the launch screen in Slice 2.
2. **Spawn timing**: renderer calls `fitAddon.fit()` → `sendResize` → `sendReady` in order; main spawns Claude on the first `terminal:resize` event so PTY gets correct dimensions.
3. **`terminal:launch` IPC wired in main**: not used in Slice 1 but wired up now so Slice 2 needs no changes to `main.ts`.

---

## Windows-specific gotchas

- **No `postinstall: electron-rebuild`**: node-pty ships N-API prebuilts; rebuild would require MSVC.
- **`external: ['node-pty']` in `vite.main.config.ts` is mandatory**: without it Vite tries to bundle the `.node` binary and the build fails.
- **`auto-unpack-natives` plugin**: `.node` binaries cannot live inside an ASAR archive; this plugin moves them to `app.asar.unpacked/` automatically.
- **`USERPROFILE` not `HOME`**: used in `findClaudePath()` on Windows.
- **Squirrel startup guard**: must be the very first statement in `main.ts`, before `app.on('ready')`.
