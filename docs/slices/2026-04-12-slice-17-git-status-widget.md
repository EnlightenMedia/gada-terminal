# Slice 17 — Git Status Widget

**Roadmap:** [2026-04-06-gada-terminal.md](../roadmaps/2026-04-06-gada-terminal.md)
**Status:** `[~] In progress`

---

## Objective

A widget that displays `git status --short` and `git log --oneline -5` for
the active working directory. Results load automatically on widget render and
can be refreshed on demand via a button. Requires the `process:spawn`
capability. Depends on Slice 15 (`WidgetAPI.getContext()`).

---

## Key Decisions

**Use `git -C <path>` rather than extending `process:spawn` with a `cwd` option.**
The existing `process:spawn` implementation in `main.ts` calls `execFile`
with no `cwd` option — it always runs in the Electron process directory.
Rather than changing that API, the widget passes the project path via git's
own `-C` flag (`git -C /project/path status --short`). This keeps the main
process unchanged and scopes the work to the widget.

**`execFile` on Windows does not auto-resolve bare executable names.**
`execFile('git', ...)` may fail with ENOENT on Windows because Node's
`execFile` does not add `.exe` or search PATHEXT without `{ shell: true }`.
During implementation, verify whether calling `git` (vs `git.exe`) works with
the current `execFile` invocation, and add `{ shell: true }` to the
`process:spawn` handler in `main.ts` if needed. This affects all `process:spawn`
consumers, not just this widget, so scope the fix carefully.

**Graceful non-repo handling.**
`git status` exits non-zero in a directory that isn't a git repo (or when git
is not installed). The widget should display a clear message in those cases
rather than showing a blank panel or silent failure.

---

## Tasks

1. **Create the widget manifest** — id, name, description; declare
   `process:spawn` capability.

2. **Implement the git query function** — calls `getContext()`, then fires
   both `git -C <path> status --short` and `git -C <path> log --oneline -5`
   via `spawnProcess`, and returns the combined results (or an error state).

3. **Render the results** — display the status output and log output in
   clearly labelled sections. Style consistently with existing widgets
   (dark background, monospace font for git output).

4. **Add a manual refresh button** — re-runs the git query and re-renders.
   Show a brief loading indicator while the commands are in flight.

5. **Handle error states** — not a git repo, git not found, spawn capability
   denied. Each case should show an informative message, not a blank panel.

6. **Verify `git` executable resolution on Windows** — test that
   `spawnProcess('git', ...)` succeeds on the Windows build. If `execFile`
   requires `{ shell: true }` to find `git`, patch the `process:spawn` branch
   in `main.ts` and confirm no regressions in the existing example widget.

---

## Done Criteria

- [ ] Opening the Git Status Widget in a git repo shows the output of
  `git status --short` and `git log --oneline -5` for the active project directory
- [ ] Clicking the refresh button re-fetches and re-renders the output
- [ ] Opening the widget in a non-git directory shows a clear "not a git repo"
  message rather than an error or blank panel
- [ ] The first use of the widget triggers the `process:spawn` capability
  approval prompt; subsequent uses within the session do not
- [ ] The widget works correctly on Windows (git output is fetched and displayed)

---

**Status:** `[~] In progress`
