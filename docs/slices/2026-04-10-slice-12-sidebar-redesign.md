# Slice 12 — Sidebar Redesign & Widget Management

**Roadmap:** [Gada Terminal](../roadmaps/2026-04-06-gada-terminal.md)
**Status:** [x] Complete

---

## Objective

A right-hand sidebar is added. Widgets can be dragged between left and right sides. A sidebar automatically hides when it contains no visible widgets. The current show/hide toggle buttons are replaced by a settings popup that lists all widgets with visibility toggles — this popup is always accessible even when both sidebars are empty.

---

## Key Decisions

**1. How to track widget side in persistence**
`FolderSettings.panelLayout` currently stores `{ order: string[]; hidden: string[] }`. This needs to gain a `sides` map (`widgetId → 'left' | 'right'`) to remember which side each widget lives on across sessions. The existing `order` array can remain flat (within each side, order is determined by position).

**2. Where to anchor the settings trigger when both sidebars are hidden**
Options:
- A fixed overlay button at the edge of the terminal (e.g. bottom-right corner)
- A button that lives in the titlebar alongside the app title

The titlebar option is cleaner — it doesn't float over terminal content and is always visible. **Decision: titlebar.**

**3. Right sidebar resize direction**
The left sidebar resizes from its left edge (handle sits between terminal and panel). The right sidebar should resize from its right edge (handle sits between panel and window edge). The same min/max width constraints apply.

---

## Tasks

1. **Add right sidebar to the layout** — A second panel element mirrors the left sidebar structure (sections container, resize handle). It is positioned on the right side of the terminal. Both sidebars share the same CSS conventions.

2. **Extend layout persistence for sides** — Add a `sides` record to `panelLayout` in `FolderSettings`. On load, widgets are placed into the correct sidebar. Default: all widgets start on the left (backwards-compatible with existing saved layouts).

3. **Enable cross-sidebar drag-and-drop** — Extend the existing section drag logic so a widget dragged onto the opposite sidebar is moved there. Drop targets on the right sidebar accept dragged widgets from the left, and vice versa.

4. **Auto-hide empty sidebars** — After any widget visibility or side change, check each sidebar's visible widget count. If a sidebar has zero visible widgets, collapse it (remove its width from the layout, hide the resize handle). Restore it as soon as a widget is shown or dragged into it.

5. **Replace toggle buttons with a settings popup** — Remove `#panel-toggle-bar` and its buttons. Add a trigger element (gear icon) in the titlebar. Clicking it opens a floating popup listing every widget (built-in and plugin) with a toggle to show/hide it. The popup closes on outside click or Escape.

6. **Persist right sidebar width** — Save the right sidebar's width independently from the left in `FolderSettings` (e.g. `sidebarRightWidth`). Restore on launch.

---

## Done Criteria

- [ ] A second sidebar is visible on the right side of the terminal when it contains at least one visible widget
- [ ] Dragging a widget section from the left sidebar and dropping it onto the right sidebar moves it there; the reverse also works
- [ ] Hiding all widgets on one side causes that sidebar to disappear; showing one widget on that side brings it back
- [ ] The settings popup is accessible (gear icon in titlebar) when both sidebars are empty — both sidebars fully hidden
- [ ] The settings popup lists all built-in and plugin widgets with working show/hide toggles
- [ ] Left and right sidebar widths both survive an app restart
- [ ] Widget side assignment (left vs right) survives an app restart
- [ ] Existing saved layouts with no `sides` field load correctly with all widgets defaulting to the left sidebar
