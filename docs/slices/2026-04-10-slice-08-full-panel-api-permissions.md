# Slice 8 — Full PanelAPI & Permissions

**Roadmap:** docs/roadmaps/2026-04-06-gada-terminal.md
**Status:** [ ] Not started

## Objective

The PanelAPI gains write capabilities — terminal input, Claude messages, process spawning, and external HTTP. Plugins declare required write capabilities in their manifest. First use of an ungrantedc capability triggers an approval card in the sidebar (same pattern as tool approval). Grants persist per-plugin per-folder and survive restarts. An updated sample plugin demonstrates a write capability after approval.

## Key Decisions

**Separate `capabilities` field vs. reusing `permissions`.** The existing `permissions` field lists read-only event subscriptions (`hook:tool-event`, etc.). Write capabilities are structurally different — they require approval and execute actions in the host. Using a separate `capabilities` field in the manifest keeps the distinction clear and avoids ambiguity about what needs approval. Recommended: add a distinct `capabilities` field.

**Capability set for this slice.** The roadmap names four: terminal input, Claude message, process spawn, and external HTTP. Process spawning and HTTP introduce meaningful security surface. All four should gate on explicit user approval, so the same approval flow covers all of them.

**Grant granularity.** Grants should be per-plugin per-capability (not all-or-nothing) so users can approve `terminal:write` while denying `process:spawn` for the same plugin. Stored in the existing `enabledPlugins` structure in `folder-settings.json` — the field is already declared but unused.

**Approval card placement.** Approval requests should appear in the sidebar as a card (same visual treatment as tool permission cards in Slice 5), not as a modal or OS dialog. This keeps the interaction pattern consistent and non-blocking for the terminal.

## Tasks

1. Expand the manifest schema with a `capabilities` field listing write operations the plugin may request (e.g. `terminal:write`, `claude:message`, `process:spawn`, `http:request`). Update the manifest parser and `PluginDescriptor` type accordingly.

2. Add write methods to the PanelAPI shim injected into plugin iframes. Each method routes the request through `postMessage` to the renderer, which forwards it to the main process via IPC.

3. Main process receives plugin write requests and checks the persisted grant for that plugin + capability. If granted, executes the operation. If denied, returns an error. If not yet decided, emits a pending-approval event to the renderer.

4. Renderer displays a plugin capability approval card in the sidebar when an ungrantedc capability is requested — showing plugin name, the capability being requested, and Allow / Allow for session / Deny actions — same visual and interaction pattern as tool approval cards.

5. Grants and denials are persisted per-plugin per-capability in `folder-settings.json` and loaded at startup so approved plugins do not re-prompt after restart.

6. Update the sample plugin (or ship a second sample) to declare and use at least one write capability, demonstrating the full flow: first launch prompts for approval, subsequent launches execute without a prompt.

7. Write `PANEL_PLUGIN_AUTHORING.md` documenting the manifest schema (both `permissions` and `capabilities`), every PanelAPI method with its approval requirement, the capability strings, and a step-by-step authoring example.

## Done Criteria

- [ ] A plugin declaring `capabilities` in its manifest loads without error; one without the field also loads without error
- [ ] When a plugin calls a write method for the first time, an approval card appears in the sidebar and the write operation is held until the user responds
- [ ] Clicking Allow executes the operation and persists the grant; the plugin is not prompted again in the same session or after restart
- [ ] Clicking Allow for session executes the operation but does not persist — the plugin is prompted again after restart
- [ ] Clicking Deny returns an error to the plugin and does not execute the operation; the plugin is prompted again next time it tries
- [ ] A plugin that has been granted `terminal:write` can write text to the terminal after approval
- [ ] Grants survive app restart — a previously-approved plugin does not re-prompt
- [ ] A plugin that has not declared a capability in its manifest and attempts to use it receives an error; no approval card is shown
- [ ] `PANEL_PLUGIN_AUTHORING.md` exists and documents the full API surface
