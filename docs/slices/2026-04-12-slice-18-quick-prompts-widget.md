# Slice 18 — Quick Prompts Widget

**Roadmap:** [2026-04-06-gada-terminal.md](../roadmaps/2026-04-06-gada-terminal.md)
**Status:** `[x] Complete`

---

## Objective

A widget showing a user-editable list of saved prompt snippets. Each entry
has a label, a message body, and a scope (user or project). Clicking an
entry sends its body to Claude via `claude:message`. Prompt management
(add, edit, delete) is handled in a popup dialog to keep the main widget
view uncluttered. The list persists across restarts. Requires the
`claude:message` capability.

---

## Key Decisions

**Use `WidgetAPI.storage` not `localStorage` directly.**
Widget iframes run with `allow-scripts` but not `allow-same-origin`, giving
them an opaque origin — direct `localStorage` access throws a `SecurityError`.
Storage is proxied through `WidgetAPI.storage.get/set` as established in
Slice 16.

**Two storage keys — one per scope.**
User-level prompts are stored under a fixed key and are available in every
project. Project-level prompts are stored under a key derived from the
working directory (via `WidgetAPI.getContext()`) and are only shown when
that project is active. The widget combines both lists at render time,
with a visual indicator distinguishing the two scopes.

**Management in a popup dialog, not inline.**
Add, edit, and delete controls live in a modal/overlay triggered by a
"Manage" button on the widget. The main widget view shows only the prompt
list and send buttons, keeping it compact. The dialog renders inside the
iframe (no native dialogs) using a full-cover overlay.

---

## Tasks

1. **Create the widget manifest** — id, name, description; declare
   `claude:message` capability.

2. **Implement the prompt list view** — on load, call `getContext()` then
   read both storage keys and render the combined list. Each entry shows
   its label, a scope indicator, and a send button. Show a placeholder when
   the combined list is empty.

3. **Implement send** — clicking a send button calls `sendClaudeMessage`
   with the entry's body. Show brief feedback on the button after sending.
   Handle capability-denied gracefully.

4. **Build the management dialog** — a full-cover overlay triggered by a
   "Manage" button. Contains the form for adding a new prompt (label, body,
   scope selector) and the list of existing prompts with edit and delete
   controls per entry.

5. **Implement add, edit, delete** — all three operations update the
   relevant storage key (user or project depending on scope) and re-render
   the main list when the dialog is closed or changes are saved.

---

## Done Criteria

- [ ] The widget shows the combined list of user-level and project-level
  prompts, with each entry's scope visually distinguishable
- [ ] Clicking a prompt's send button delivers its body to Claude; the first
  click triggers the `claude:message` approval prompt
- [ ] Opening the Manage dialog allows adding a new prompt with label, body,
  and scope (user or project)
- [ ] Existing prompts can be edited and deleted from the dialog
- [ ] User-level prompts appear regardless of which project is active
- [ ] Project-level prompts change when switching to a different project
  directory
- [ ] The prompt list survives app restarts

---

**Status:** `[x] Complete`
