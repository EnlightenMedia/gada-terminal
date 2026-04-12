# Slice 14 — Error Log Widget

**Roadmap:** [2026-04-06-gada-terminal.md](../roadmaps/2026-04-06-gada-terminal.md)
**Status:** `[x] Complete`

---

## Objective

A built-in widget that captures every `PostToolUseFailure` event and displays them as a timestamped list showing the tool name and error message. The list is empty at the start of each session and requires no user permission prompts.

---

## Key Decisions

**Session clearing is free.** Widgets are destroyed and re-created as fresh iframes on every session launch (`createWidgetPanels()` runs inside `launch()`). No session lifecycle event is needed — the in-memory error list resets naturally on each new session.

**Built-in widget, not a user plugin.** Like the example widget, this lives in the app's bundled `widgets/` directory and is present by default. The user can hide it via widget management but it is always installed.

**`hook:tool-event` is a permission, not a capability.** Subscribing to tool events requires `"permissions": ["hook:tool-event"]` in the manifest but triggers no approval prompt — it is a read-only, zero-risk subscription.

---

## Tasks

1. **Create the widget manifest** — a `widget.json` declaring the widget id, name, description, and `hook:tool-event` permission. No capabilities.

2. **Implement error capture** — subscribe to `hook:tool-event` and filter to `PostToolUseFailure` events. Accumulate entries in memory (array of `{ timestamp, toolName, error }`).

3. **Render the error list** — display each entry as a row: formatted time (HH:MM:SS), tool name, and error text. Newest entries at the top. Style consistently with the app's existing card/badge patterns.

4. **Empty state** — when no errors have been captured, show a quiet placeholder ("No errors this session").

5. **Live title badge** — update the widget title via `WidgetAPI.setTitle()` to reflect the current error count (e.g. "Error Log (3)"), resetting to "Error Log" when the count is zero.

---

## Done Criteria

- [ ] The widget appears in the widget management popup and can be shown/hidden
- [ ] When Claude executes a tool that fails, a new row appears in the widget within the same render cycle as the failure event
- [ ] Each row shows: timestamp (HH:MM:SS), tool name, and full error message
- [ ] Rows are ordered newest-first
- [ ] When no failures have occurred, a placeholder is visible inside the widget
- [ ] The widget title shows the running error count once errors exist, and resets to the base title when there are none
- [ ] Starting a new Claude session (returning to launch screen and clicking Start) shows an empty error log
- [ ] No permission approval prompt appears when the widget is first used
