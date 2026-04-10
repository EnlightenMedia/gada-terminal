# Slice 9 — Plugin Management UI

**Roadmap:** docs/roadmaps/2026-04-06-gada-terminal.md
**Status:** [x] Complete

## Objective

A settings screen lists installed plugins with name, version, enabled/disabled toggle, and individually revocable capability grants. Disabling a plugin removes its panel immediately. Revoking a grant means the next use of that capability will prompt for approval again.

## Key Decisions

**Settings screen placement.** The screen needs to be accessible mid-session (since disabling removes panels immediately), so it can't live only on the launch screen. Two options: (a) a modal overlay triggered by a button in the sidebar header area, or (b) a dedicated sidebar panel. A modal overlay keeps it clearly distinct from live data panels and avoids complicating the panel order/visibility system. Recommended: modal overlay.

**Enable/disable scope.** Disabling a plugin mid-session removes its panel immediately. Re-enabling during the same session is desirable but requires re-injecting the iframe — the plugin would start fresh with no prior state. Simpler: enable/disable takes effect immediately on disable (panel removed), but re-enabling requires a restart. This avoids re-initialisation complexity and aligns with how most plugin systems work.

**`enabledPlugins` field.** This field in FolderSettings is declared but currently unused. Slice 9 implements it: a plugin absent from `enabledPlugins` is shown in the management UI as disabled, and is skipped when building panels. An empty/missing `enabledPlugins` means all plugins are enabled (backwards-compatible default).

**Grant revocation scope.** Revoking a persistent grant (from `pluginGrants` in FolderSettings) takes effect immediately for future capability requests in the same session — the in-memory session grants are also cleared. The plugin's panel remains visible; only the capability approval is reset.

## Tasks

1. Add a settings button to the sidebar that opens the plugin management overlay.

2. Build the overlay shell — a full-height panel or modal that appears over the sidebar content, with a close button and a title.

3. Render the plugin list — one row per installed plugin showing name, version, and an enabled/disabled toggle. Grey out version and grants for disabled plugins.

4. Implement enable/disable: toggling off removes the plugin's panel from the DOM immediately and persists the change to `enabledPlugins`; toggling on persists the change but shows a "restart required" note since re-injection is not supported mid-session. Startup respects `enabledPlugins` by skipping disabled plugins during panel creation.

5. Render per-plugin capability grants — for each plugin, list its granted capabilities (from `pluginGrants`) with a Revoke button. Revoking removes the persistent grant and clears the matching session grant so the next call prompts again.

## Done Criteria

- [x] A button in the sidebar opens the plugin management overlay
- [x] The overlay lists every installed plugin with name and version
- [x] A plugin can be disabled via toggle — its panel disappears from the sidebar immediately
- [x] After disabling and restarting, the disabled plugin's panel does not appear
- [x] A disabled plugin shows a "restart to enable" note when toggled back on — it does not re-appear in the current session
- [x] After restarting with the plugin re-enabled, its panel appears normally
- [x] Granted capabilities are listed per plugin with a Revoke button
- [x] Revoking a grant causes the next use of that capability to show the approval card again
- [x] A plugin with no grants shows no revocable entries (not an empty list with a heading)
- [x] The overlay can be closed and the sidebar returns to its previous state
