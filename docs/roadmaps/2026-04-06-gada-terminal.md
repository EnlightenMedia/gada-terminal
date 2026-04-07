# Gada Terminal Roadmap

**Goal:** Build a cross-platform Electron desktop app that wraps the Claude Code CLI with a real-time monitoring sidebar for tool calls, cost, context usage, and permission approval.
**Approach:** Windows-first incremental delivery, cutting vertically through all layers each slice. Start with a working terminal, add the launch screen, then layer in the HTTP hook server and each sidebar panel one at a time before finishing with persistence polish and the plugin framework.
**Created:** 2026-04-06

## Slices

- [x] Slice 1 — Working Terminal: A Windows desktop app opens with a full-fidelity terminal running Claude via xterm.js + node-pty. You can type, interact with Claude, copy/paste, drag files in, and the terminal resizes with the window.
- [x] Slice 2 — Launch Screen: Before Claude starts, a GUI card lets you pick a working directory (with recent folders), choose model/effort/permission mode/extra args, and click "Start Claude". Settings persist per folder between sessions.
- [x] Slice 3 — Live Tool Feed: A sidebar appears with a live feed of every tool Claude invokes — file reads, bash commands, web searches — each shown with a timestamp, target, and running/done/failed status badge. Requires the internal HTTP hook server.
- [x] Slice 4 — Cost & Context Panels: Two new sidebar sections show real-time token counts, cost per request, and a color-coded context window progress bar — all updated live as Claude works via OTLP telemetry.
- [x] Slice 5 — Permission Approval: When Claude wants to run a tool, a card appears in the sidebar. Claude waits while you choose Allow, Allow for session, or Deny. Auto-approved reads are transparent; risky actions require a click.
- [x] Slice 6 — Persistence & Polish: Accent color, panel reorder/hide, recent plugins all survive restarts. The app feels complete and personalized. → [plan](../slices/2026-04-06-slice-6-persistence-polish.md)
- [ ] Slice 7 — Plugin Loader: A `plugins/` directory is scanned on startup. Each plugin's `plugin.json` manifest is parsed and its entry point loaded into a sandboxed renderer context with a read-only PanelAPI (event subscriptions only). A sample plugin renders a panel. Drop a folder in, see a new panel appear.
- [ ] Slice 8 — Full PanelAPI & Permissions: The PanelAPI gains write capabilities — terminal input, Claude messages, process spawning, external HTTP. Plugins declare required permissions in their manifest. First use of a capability triggers a user approval prompt (same pattern as tool approval); grants persist. A sample plugin writes to the terminal after approval.
- [ ] Slice 9 — Plugin Management UI: A settings screen lists installed plugins with name, version, enabled/disabled toggle, and individually revocable permissions. Disabling a plugin removes its panel immediately.
- [ ] Slice 10 — Linux Support: The app runs correctly on Linux with titleBarOverlay accent color, correct Claude path resolution, and DEB/RPM packaging. All Linux-specific branches verified.
- [ ] Slice 11 — macOS Support: The app runs correctly on macOS with hidden-inset titlebar, custom HTML accent bar styled with the accent color, Homebrew Claude path resolution, Cmd+V paste, and DMG packaging. All macOS-specific branches verified.
