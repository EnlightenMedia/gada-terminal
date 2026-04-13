# Slice 19 — Pomodoro Timer Widget

**Roadmap:** [2026-04-06-gada-terminal.md](../roadmaps/2026-04-06-gada-terminal.md)
**Status:** `[x] Complete`

---

## Objective

A focus timer widget with configurable work and break durations. Shows a
countdown and cycles automatically between work and break intervals. Tracks
completed pomodoros and total focused time for the session. No capabilities
required — configuration persists via `WidgetAPI.storage`; session stats
reset on page reload.

---

## Key Decisions

**`WidgetAPI.storage` for config, not `localStorage` directly.**
Widget iframes run with `allow-scripts` but without `allow-same-origin`,
giving them an opaque origin — direct `localStorage` access throws a
`SecurityError`. Work and break durations are persisted through
`WidgetAPI.storage.get/set`, consistent with Slices 16 and 18.

**Session stats are not persisted.**
Completed pomodoro count and total focused time reset when the widget
reloads. The roadmap specifies "for the session" — writing these to storage
would misrepresent interrupted sessions as completed work.

**Settings inline, not in a dialog.**
The timer is compact by nature; an in-place "edit durations" mode (toggle
in the widget itself) avoids a dialog dependency and is proportionate to
the feature scope.

---

## Tasks

1. **Create the widget manifest** — id, name, description; no capabilities.

2. **Implement the timer display** — show the current phase (Work / Break),
   the countdown in `MM:SS`, and a Start / Pause / Reset control. Render
   the completed pomodoro count and total focused minutes for the session.

3. **Implement the countdown logic** — `setInterval`-based tick, switching
   automatically from work to break (and back) when the countdown reaches
   zero. Increment the pomodoro count and accumulated focus time each time
   a work interval completes.

4. **Implement settings** — an edit mode (toggled by a gear/settings button)
   that exposes number inputs for work duration and break duration (in
   minutes). Saving writes both values via `WidgetAPI.storage.set` and
   resets the timer to the new work duration.

5. **Load persisted config on startup** — on widget load, read stored
   durations via `WidgetAPI.storage.get`; fall back to defaults (25 min
   work / 5 min break) if nothing is stored.

---

## Done Criteria

- [ ] The widget shows a countdown that ticks down from the configured work
  duration when started
- [ ] When the work interval reaches zero it automatically switches to the
  break interval, and vice versa
- [ ] The current phase (Work / Break) is clearly visible at all times
- [ ] Completed pomodoro count increments by one each time a work interval
  finishes
- [ ] Total focused time updates each time a work interval completes
- [ ] Work and break durations can be changed via a settings control; the
  timer resets to the new work duration after saving
- [ ] Configured durations survive an app restart (verified by reloading the
  app and confirming the settings fields show the saved values)
- [ ] Session stats (count + focused time) reset to zero on page reload
- [ ] No capability approval prompt appears at any point

---

**Status:** `[x] Complete`
