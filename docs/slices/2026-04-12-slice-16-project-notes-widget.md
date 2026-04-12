# Slice 16 — Project Notes Widget

**Roadmap:** [2026-04-06-gada-terminal.md](../roadmaps/2026-04-06-gada-terminal.md)
**Status:** `[P] Planned`

---

## Objective

A plain textarea widget for jotting notes about the current project. Each
project has its own independent notes that survive app restarts, keyed by
the working directory from `WidgetAPI.getContext()`. No capabilities
required.

---

## Key Decisions

**WidgetAPI storage methods instead of `localStorage`.** The widget sandbox
(`allow-scripts`, no `allow-same-origin`) gives iframes an opaque origin —
`localStorage` access throws a `SecurityError`. Storage is proxied through
`WidgetAPI.storage.get(key)` and `WidgetAPI.storage.set(key, value)` via
postMessage to the parent renderer, which persists on the widget's behalf.
Storage is scoped per widget ID so widgets cannot read each other's data.
This API will also be used by Slices 18 (Quick Prompts) and 19 (Pomodoro).

**Storage key.** Notes are keyed by the full working directory path so each
project is independent. An empty or missing context resolves to a fallback
key (e.g. `"__default__"`) rather than silently merging all notes.

---

## Tasks

1. **Add `WidgetAPI.storage.get(key)` and `WidgetAPI.storage.set(key, value)`**
   — extend the shim and the parent message handler to support a simple
   string key-value store scoped per widget ID. No capability declaration or
   approval prompt required.

2. **Create the notes widget manifest** — widget id, name, description. No
   permissions, no capabilities.

3. **Implement the notes textarea** — on load, call `getContext()` to get
   the working directory, then `storage.get(key)` to load any saved content.
   Render a full-width textarea pre-filled with that content.

4. **Persist on input** — save the textarea content via `storage.set(key, value)`
   on each change (debounced). The key is derived from the working directory.

5. **Update `WIDGET_AUTHORING.md`** — document the new `storage` API methods.

---

## Done Criteria

- [ ] Opening the Project Notes widget shows a textarea
- [ ] Text typed in the textarea is still present after restarting the app
  and starting a new session in the same folder
- [ ] Starting a session in a different folder shows that folder's own
  independent notes (or an empty textarea if none exist yet)
- [ ] No permission approval prompt appears at any point
- [ ] The widget works without declaring any capabilities in its manifest

---

**Status:** `[P] Planned`
