# Slice 15 — WidgetAPI Context

**Roadmap:** [2026-04-06-gada-terminal.md](../roadmaps/2026-04-06-gada-terminal.md)
**Status:** `[P] Planned`

---

## Objective

`WidgetAPI` gains a `getContext()` method that returns the active working
directory path. Any widget can call it without declaring capabilities or
triggering a permission prompt. This is a prerequisite for Slices 16, 17,
and 21, which need to scope data or commands to the current project.

---

## Key Decisions

**The directory is the launch-screen selected folder, not `process.cwd()`.** 
`getContext()` returns the project directory the user picked on the launch
screen — the same path used to start Claude and key folder-scoped settings.
It is not the working directory of the Electron process itself.

**Async postMessage round-trip.** `getContext()` returns a Promise, resolved
by the parent frame via the existing postMessage channel. This is consistent
with the rest of the WidgetAPI and allows widgets to query context at any
point in their lifecycle, not just at construction time.

**No capability, no permission prompt.** Reading the working directory is
read-only and carries no security risk. It follows the same pattern as
`hook:tool-event` in Slice 14 — declared in the manifest if needed for
clarity, but no approval UI.

---

## Tasks

1. **Expose `getContext()` in the WidgetAPI shim** — add the method to the
   shim injected by `buildSrcdoc()`. Returns a Promise that resolves with the
   launch-screen selected folder path via a postMessage round-trip.

2. **Handle the `getContext` request in the parent frame** — in the existing
   `message` handler that processes widget postMessages, respond to the new
   request type with the active working directory.

3. **Update the example widget** — add a `getContext()` call to the bundled
   example widget so there is a live demonstration of the API and a
   smoke-test path.

4. **Update `WIDGET_AUTHORING.md`** — document `getContext()`, what it
   returns, and when to use it.

5. **Update TypeScript types** — reflect the new method on the WidgetAPI
   surface in `types.d.ts` or wherever the interface is defined.

---

## Done Criteria

- [ ] Calling `WidgetAPI.getContext()` from inside a widget returns the
  working directory that was selected on the launch screen
- [ ] The example widget visibly displays the result of `getContext()` after
  a session is started
- [ ] No permission approval prompt appears at any point during widget load
  or when `getContext()` is called
- [ ] Re-enabling a widget from the widget management UI and then calling
  `getContext()` returns the same directory as the active session
- [ ] The TypeScript types (or JSDoc) for WidgetAPI reflect the new method

---

**Status:** `[P] Planned`
