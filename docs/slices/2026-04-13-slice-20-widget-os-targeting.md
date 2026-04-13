# Slice 20 — Widget OS Targeting

**Roadmap:** [Gada Terminal Roadmap](../roadmaps/2026-04-06-gada-terminal.md)
**Status:** [x] Complete

---

## Objective

The widget manifest gains an optional `os` field accepting an array of platform strings (`win32`, `darwin`, `linux`). Widgets that declare `os` are silently excluded on non-matching platforms. Widgets with no `os` field load on all platforms. The widget management UI indicates platform-restricted widgets when shown on a matching platform (i.e., the user can see that a widget is Windows-only when running Windows, but won't see it at all on macOS).

---

## Key Decisions

- **Match string is `process.platform`** — values are `win32`, `darwin`, `linux`. No aliases needed; this matches what Node uses and what the roadmap specifies.
- **Filtering happens in the main process** (`loadWidgets`) — the renderer never receives descriptors for non-matching platforms. This keeps the renderer simple and avoids dead widgets appearing in any list.
- **Management UI badge, not suppression** — on a matching platform, platform-restricted widgets are shown in the widget management UI with an OS badge so the user knows it's intentionally platform-scoped. Widgets excluded by platform mismatch are already invisible (filtered in main), so nothing extra is needed for the mismatched case.

---

## Tasks

1. **Extend `WidgetDescriptor`** — add an optional `os` field (string array) to the type definition.
2. **Filter in `loadWidgets`** — after parsing the manifest, skip widgets whose `os` array doesn't include the current `process.platform`. Widgets with no `os` field pass through unchanged.
3. **Surface `os` on the descriptor** — include the `os` field in the pushed descriptor so the renderer can display it.
4. **Add OS badge in widget management UI** — when rendering a widget row, if `desc.os` is set, show a small badge listing the platforms (e.g., "win32 only"). This is an informational label, not a control.
5. **Update existing `os`-scoped widget manifest** — add `"os": ["win32"]` to the `open-terminal` widget manifest. (It doesn't exist yet, but the Quick Prompts and Pomodoro manifests serve as a reference for the format; the Open Terminal widget from Slice 21 will use this field.)

   > **Note:** No existing built-in widget is platform-restricted today. The task here is confirming the field works end-to-end; Slice 21 will be the first real consumer.

---

## Done Criteria

- [ ] A widget manifest with `"os": ["win32"]` loads on Windows and does not load on macOS/Linux (verified by inspection of the descriptor list or by temporarily adding the field to an existing widget).
- [ ] A widget manifest with no `os` field continues to load on all platforms — no regression.
- [ ] A widget manifest with `"os": ["darwin"]` is silently excluded on Windows (no error, no console warning, no ghost panel).
- [ ] The widget management UI shows a platform badge (e.g., "win32") next to any widget whose manifest declares `os`.
- [ ] `WidgetDescriptor` type includes the `os` field with no TypeScript errors in the build.
