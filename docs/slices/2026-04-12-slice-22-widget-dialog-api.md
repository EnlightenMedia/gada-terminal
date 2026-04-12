# Slice 22 — Widget Dialog API

**Roadmap:** [2026-04-06-gada-terminal.md](../roadmaps/2026-04-06-gada-terminal.md)
**Status:** `[x] Complete`

---

## Objective

Any widget can open a full-window overlay dialog by calling
`WidgetAPI.openDialog(script)`. The dialog renders in the parent renderer
document (not inside the widget iframe), so it overlays the entire app
window exactly like the existing permission and capability approval dialogs.
The dialog script runs in its own sandboxed iframe and calls
`DialogAPI.close(result)` to dismiss itself. The widget receives the result
as a resolved Promise. Slice 18 (Quick Prompts) depends on this.

---

## Key Decisions

**Dialog content is a script string, not a separate file.**
The widget passes a self-contained JS string to `openDialog`. The parent
embeds it in a new sandboxed iframe srcdoc, using the same `buildSrcdoc`
approach already used for widget panels. This keeps the authoring model
familiar and avoids any new file-loading mechanism.

**Data travels through the script, not through storage proxying.**
The widget embeds its current state directly into the script string before
calling `openDialog` (e.g. serialising the prompt list as a JSON literal).
The dialog operates on that in-memory copy, then returns the modified data
via `DialogAPI.close(result)`. The widget persists whatever comes back.
This keeps the dialog stateless and avoids the complexity of proxying
`storage` or `getContext` across two iframe boundaries.

**Backdrop click dismisses the dialog with a null result.**
Clicking outside the dialog box closes it and resolves the widget's promise
with `null`. This matches the existing capability-approval dismiss behaviour.

**One dialog at a time, globally.**
If a second `openDialog` call arrives while one is already open, it is
ignored. This avoids stacking complexity and is sufficient for all current
use cases.

**`getTheme` and `DialogAPI.close` are the only dialog shim APIs.**
The dialog does not get `WidgetAPI` — it gets a lean `DialogAPI` object with
`close(result)` and `getTheme()`. If future dialogs need more (storage,
context), that can be added in a later slice.

---

## Tasks

1. **Add `WidgetAPI.openDialog(script)` to the widget shim** — sends a
   `widget:dialog-open` postMessage to the parent with the script string
   and a reqId. Returns a Promise that resolves when the dialog closes.

2. **Handle `widget:dialog-open` in the parent renderer** — create the
   full-window backdrop overlay and a centred dialog box. Build a srcdoc
   for the dialog iframe using a `DialogAPI` shim, then inject the widget's
   script into it and attach the iframe to the dialog box.

3. **Implement the `DialogAPI` shim** — exposes `close(result)` (sends
   `dialog:close` to the parent) and `getTheme()` (same theme object as
   `WidgetAPI.getTheme()`).

4. **Route `dialog:close` back to the originating widget** — the parent
   handles `dialog:close`, removes the overlay and dialog from the DOM, and
   sends `widget:dialog-response` to the widget iframe to resolve its promise.
   Backdrop clicks follow the same path with a `null` result.

5. **Demonstrate with the example widget** — add a "Open dialog" button to
   the example widget that opens a simple dialog, confirms the result comes
   back, and displays it. This serves as a smoke test and authoring example.

6. **Update `WIDGET_AUTHORING.md` and TypeScript types** — document
   `openDialog`, `DialogAPI`, the data-embedding pattern, and the
   `close(result)` / null-on-dismiss behaviour.

---

## Done Criteria

- [ ] Calling `WidgetAPI.openDialog(script)` from the example widget opens a
  full-window overlay dialog that sits above the sidebar, terminal, and all
  other app chrome
- [ ] The dialog can call `DialogAPI.close({ some: 'value' })` and the
  widget's Promise resolves with that value
- [ ] Clicking outside the dialog box (on the backdrop) closes it and
  resolves the Promise with `null`
- [ ] While a dialog is open, a second `openDialog` call from the same or
  another widget has no effect
- [ ] Closing the app with a dialog open does not throw errors
- [ ] The TypeScript types and `WIDGET_AUTHORING.md` reflect the new API

---

**Status:** `[x] Complete`
