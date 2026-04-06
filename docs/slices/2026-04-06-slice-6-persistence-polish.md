---
slice: 6 — Persistence & Polish
roadmap: docs/roadmaps/2026-04-06-gada-terminal.md
status: [x] Complete
---

# Slice 6 — Persistence & Polish

**Objective:** Every user preference survives restarts. Accent color, panel
order/visibility, extra launch args, and window geometry are all restored
exactly as the user left them. Panel layout is per-folder so different
projects can have different sidebar configurations. The app feels complete
and personalized.

---

## What already works

From prior slices:
- Accent color — saved per-folder in `folder-settings.json`, fully wired
- Recent folders — persisted in `recent-folders.json`
- Launch options (model, effort, permission mode, resume/continue) — saved per-folder and restored on folder selection
- Panel order and hidden sections — saved in `localStorage` (global, not per-folder)
- `FolderSettings.panelLayout` type exists in `persistence.ts` but is never read or written

## Gaps identified

1. **extraArgs not restored** — saved in `FolderSettings.launchOptions.extraArgs` on launch but `applySettings()` never reads it back when a folder is selected
2. **Panel layout is global, not per-folder** — currently uses `localStorage`; `FolderSettings.panelLayout` exists in the type but is unused
3. **Window geometry not persisted** — size and position reset to defaults on every restart
4. **"Recent plugins" placeholder** — roadmap mentions this; Slice 7 adds the plugin framework, but any plugin-related state (e.g. enabled plugin list) needs a persistence slot now so Slice 7 can write to it without touching persistence infrastructure

---

## Tasks

1. **Restore extraArgs on folder selection** — `applySettings()` should populate the Extra Args input from `launchOptions.extraArgs`
2. **Wire panel layout to per-folder persistence** — on launch, save current `sectionOrder` + `hiddenSections` into `FolderSettings.panelLayout`; on folder selection, load and apply saved layout (fall back to defaults if none saved); remove the `localStorage` approach for order and hidden
3. **Persist window geometry** — save window bounds (x, y, width, height) to a global settings file on `resize` + `move`; restore on next open (skip if bounds would be off-screen)
4. **Add a plugin-list slot to FolderSettings** — add `enabledPlugins?: string[]` to the `FolderSettings` type and `persistence.ts` so Slice 7 has a stable place to write without touching persistence infrastructure
---

## Key decisions

1. **Per-folder vs global panel layout** — panel layout should follow the folder since different projects may need different sidebar focus. This means switching folders on the launch screen should update the panel preview (or at minimum apply on launch).
2. **Window geometry scope** — geometry is global (not per-folder) since it's a physical monitor preference, not a project preference. A separate `global-settings.json` or an entry keyed `'__global__'` in `folder-settings.json` could hold it.
3. **Panel layout save timing** — save on every toggle/reorder (same as today with localStorage) so nothing is lost if the app is force-quit.
4. **Plugin slot is type-only this slice** — no UI, no loading, just the type field and a no-op `getEnabledPlugins` helper in `persistence.ts`. Slice 7 fills it in.

---

## Done criteria

- [ ] Selecting a recent folder on the launch screen restores Extra Args as well as model/effort/permission mode
- [ ] Reordering or hiding a panel section, then restarting the app, shows the same order and visibility
- [ ] Two different folders have independent panel layouts (verified by switching between them at launch)
- [ ] App window reopens at the same size and position it was closed at (on the same monitor)
- [ ] `FolderSettings` type includes `enabledPlugins?: string[]`
- [ ] No regressions: accent color, launch options, recent folders all still work as before

---

## Out of scope

- Visual polish, empty states, transition smoothness — no concrete items identified; revisit if specific issues surface during testing
