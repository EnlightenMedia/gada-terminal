# Slice 5 — Permission Approval

**Status:** complete
**Observable result:** When Claude wants to run a risky tool, a card appears in the Permissions sidebar section. Claude waits while you choose Allow, Allow for session, or Deny. Read-only tools (Read, Glob, Grep, LS, NotebookRead) are auto-approved silently. Pending cards auto-deny after 60 s to avoid hanging Claude indefinitely.

---

## Files

| File | Change |
|---|---|
| `src/types.d.ts` | Add `PermissionDecision`, `PermissionRequest`; extend `electronAPI` |
| `src/hookServer.ts` | `AUTO_APPROVE` set; `pendingPermissions` map; hold PreToolUse response; `decidePermission` on `HookServer` |
| `src/main.ts` | `sessionAllowedTools`; `pendingToolNames`; third callback; `permission:decide` IPC handler |
| `src/preload.ts` | Expose `onPermissionRequest` and `decidePermission` |
| `index.html` | Permission card CSS |
| `src/renderer.ts` | `showPermissionsSection`; `createPermCard`; `onPermissionRequest` subscription |

---

## Build steps

- [x] Step 1 — `src/types.d.ts`: add `PermissionDecision`, `PermissionRequest`, extend `electronAPI`
- [x] Step 2 — `src/hookServer.ts`: `AUTO_APPROVE`, `pendingPermissions`, hold PreToolUse, `decidePermission`
- [x] Step 3 — `src/main.ts`: session allow-list, `pendingToolNames`, update `startHookServer` call, IPC handler
- [x] Step 4 — `src/preload.ts`: expose `onPermissionRequest` and `decidePermission`
- [x] Step 5 — `index.html`: permission card CSS
- [x] Step 6 — `src/renderer.ts`: `showPermissionsSection`, `createPermCard`, subscription

---

## Key decisions

1. **Auto-approve set** — `Read`, `Glob`, `Grep`, `LS`, `NotebookRead` never prompt; they still fire a `ToolEvent` so the Tools feed remains complete.
2. **Hold HTTP response** — `pendingPermissions` map keyed by `id` stores `{ res, timer }`. `decidePermission(id, decision)` clears timer, deletes entry, sends response.
3. **Session allow-list in main.ts** — `sessionAllowedTools: Set<string>` checked before forwarding to renderer; populated on `allow-session` decisions.
4. **`hookServerRef` pattern** — `let hookServerRef: HookServer | null = null` lets the `onPermissionNeeded` callback reference `decidePermission` before the variable is assigned (safe because no tool calls arrive before Claude spawns).
5. **Timeout is server-side only** — after 60 s the hook server auto-denies and Claude continues; the renderer card stays visually "pending" with dead buttons (stale but harmless). No extra IPC needed for Slice 5.
6. **Claude Code protocol** — `permissionDecision` only accepts `'allow'` or `'deny'`; `allow-session` maps to `'allow'` at the wire level.
7. **Auto-show Permissions section** — `showPermissionsSection()` is called whenever a request arrives so the user sees it without having to click the toggle.
