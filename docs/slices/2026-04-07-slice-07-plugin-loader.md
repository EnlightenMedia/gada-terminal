# Slice 7 — Plugin Loader

**Roadmap:** docs/roadmaps/2026-04-06-gada-terminal.md
**Status:** [ ] Not started

## Objective

A `plugins/` directory is scanned on startup. Each plugin's `panel-plugin.json` manifest is parsed and its entry point loaded into a sandboxed iframe alongside the four built-in panels. A read-only PanelAPI (event subscriptions only) is injected into each iframe. A sample plugin ships in the repo. Drop a plugin folder in, restart, see a new panel appear.

## Key Decisions

**Plugin discovery locations.** The spec defines two sources: `<userData>/plugins/panels/` for user-installed plugins, and directories passed via the launch screen plugin picker. Both should be scanned at startup. The launch screen already wires up plugin dirs as CLI args — the main process needs to read these at spawn time.

**Manifest filename.** The spec uses `panel-plugin.json`. The launch screen currently passes `--plugin-dir`, but §20.1 references `--panel-plugin-dir`. This discrepancy should be resolved during implementation — recommend settling on one flag name and making the launch screen and main process consistent.

**PanelAPI injection mechanism.** The iframe runs with `sandbox="allow-scripts"` (no parent DOM access, no network). Without `allow-same-origin`, the iframe has an opaque origin and cannot load external scripts via `src`. The chosen approach is `srcdoc` with inlined code: the main process reads the plugin's entry file from disk and passes the source string to the renderer over IPC. The renderer builds a `srcdoc` containing the PanelAPI shim inline followed by the plugin code inline. No new infrastructure required.

**Read-only scope for this slice.** The PanelAPI in Slice 7 exposes only: `on(eventType, callback)`, `getTheme()`, `setTitle(title)`, `setHeight(px)`. Write capabilities (`emit`, terminal input, process spawning) are deferred to Slice 8.

## Tasks

1. Main process scans plugin discovery locations at startup, parses valid `panel-plugin.json` manifests, reads each entry file's source, and builds a list of plugin descriptors (id, name, declared permissions, entry source) to send to the renderer
2. Plugin descriptors are passed to the renderer via IPC before the panel UI initialises
3. Renderer dynamically creates a draggable panel section with a sandboxed iframe for each plugin
4. A PanelAPI shim is injected into each iframe providing `on()`, `getTheme()`, `setTitle()`, and `setHeight()`
5. Main process forwards declared IPC events (tool calls, cost, context) to each plugin iframe based on its manifest `permissions` field
6. Plugin panel IDs are included in the panel order and visibility persistence alongside the four built-in panels
7. A sample plugin (`example-panel`) ships in the repo, subscribes to tool events, and renders a simple list

## Done Criteria

- [ ] App starts with no plugins installed — no visible change to existing behaviour
- [ ] Placing a valid plugin folder in the userData plugins directory and restarting causes a new panel to appear
- [ ] The sample plugin renders correctly and updates when tool events arrive
- [ ] Plugin panels can be reordered and hidden using the existing toggle bar and drag handles
- [ ] Panel order and visibility for plugin panels survive a restart
- [ ] A plugin with an invalid or missing manifest is silently skipped — the app does not crash
