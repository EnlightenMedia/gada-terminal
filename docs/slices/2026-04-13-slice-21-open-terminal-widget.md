# Slice 21 — Open Terminal Widget

**Roadmap:** [Gada Terminal Roadmap](../roadmaps/2026-04-06-gada-terminal.md)
**Status:** [x] Complete

---

## Objective

A widget with a button that opens a native terminal in the current working directory as a detached, independent process. On load, the widget probes for available terminals (Windows Terminal, PowerShell, Command Prompt) and surfaces a settings popover letting the user choose between those found; the selection persists in `localStorage`. Declared `"os": ["win32"]`. Depends on Slice 15 (`WidgetAPI.getContext()`) and Slice 20 (OS targeting).

---

## Key Decisions

- **New `shell:launch` capability** — `process:spawn` waits for exit and is unsuitable for opening a persistent terminal window. A new `shell:launch` capability in `main.ts` spawns the process with `detached: true` and calls `unref()`, so the child is fully independent from the Electron process. This capability also handles terminal probing (see below), keeping the permission surface to a single new capability rather than two.

- **Probing lives inside `shell:launch`** — rather than requiring `process:spawn` for probing and `shell:launch` for launching (two permission prompts), the `shell:launch` handler in main accepts a list-query mode that checks which terminal executables are on PATH and returns the filtered list. The widget calls this once on load. One capability, one prompt.

- **Terminal candidates (Windows)** — probe for: Windows Terminal (`wt.exe`), PowerShell 7 (`pwsh.exe`), Windows PowerShell (`powershell.exe`), Command Prompt (`cmd.exe`). `cmd.exe` is always present; the others may not be. Probing uses Node's `which`-style PATH resolution (or spawning `where.exe` per candidate).

- **Launch invocation per terminal** — each terminal has a different flag for opening in a directory: `wt -d <cwd>`, `pwsh -NoExit -Command "Set-Location '<cwd>'"`, `powershell -NoExit -Command "..."`, `cmd /K "cd /d <cwd>"`. These are handled in main, not the widget, so paths and flags stay out of the renderer.

---

## Tasks

1. **Add `shell:launch` capability to main process** — implement a handler for `shell:launch` in `executeCapability`. Support two call modes: a probe mode that checks which terminal executables are available and returns a list, and a launch mode that spawns the chosen terminal in the given `cwd` with `detached: true` + `unref()`.

2. **Register `shell:launch` in the capability registry** — add it to the permission label map and the allowed-capabilities list in the renderer so the approval prompt displays a meaningful description.

3. **Create the widget manifest** — `id`, `name`, `description`; declare `shell:launch` capability; declare `"os": ["win32"]`.

4. **Implement terminal probing on load** — call the `shell:launch` probe mode via `WidgetAPI`, receive the list of available terminals, and store it in widget state.

5. **Render the launch button and settings popover** — show a prominent "Open Terminal" button. A settings gear (or similar) opens a popover listing the available terminals as radio options; the chosen terminal is saved to `localStorage`. Style consistently with existing widgets.

6. **Wire the launch button** — on click, read the selected terminal from `localStorage` (defaulting to the first available), retrieve `cwd` from `WidgetAPI.getContext()`, and call `shell:launch` in launch mode.

7. **Handle edge cases** — no terminals found (show a message), `getContext()` returns null (disable button with tooltip), capability denied (show an error state).

8. **Commit** — run git-discipline and commit all slice changes with a descriptive message.

---

## Done Criteria

- [ ] The widget appears only on Windows (silently absent on other platforms via the `os` field from Slice 20).
- [ ] On first click, the `shell:launch` capability approval prompt appears; subsequent uses within the session do not re-prompt.
- [ ] Clicking "Open Terminal" opens the selected terminal as an independent window in the active project directory.
- [ ] Closing Gada Terminal does not close the opened terminal window.
- [ ] The settings popover lists only terminals that are actually installed and findable on the system.
- [ ] The selected terminal persists across widget reloads and app restarts.
- [ ] If `WidgetAPI.getContext()` returns null (no active session), the button is disabled with a clear indication why.
- [ ] All slice changes committed to git with a descriptive message.
