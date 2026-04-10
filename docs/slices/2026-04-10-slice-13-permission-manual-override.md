# Slice 13 — Permission Manual Override

**Roadmap:** [Gada Terminal](../roadmaps/2026-04-06-gada-terminal.md)
**Status:** [x] Complete

---

## Objective

The permission widget gains an Override button on each pending approval card. Pressing it releases the hook — equivalent to a timeout — causing Claude Code to fall back to displaying the full interactive permission question directly in the terminal. The user answers there as normal.

---

## Key Decisions

**1. What the override response looks like**
The hook server already handles a `passthrough` decision: it responds with `{}` (no `permissionDecision` field). Claude Code interprets the absence of a decision as a pass-through and presents its own interactive permission prompt in the terminal. No new server-side logic is needed — the renderer just needs to call `decidePermission(id, 'passthrough')`.

**2. What the card does after override**
The card is removed from the feed and a history entry is added (same pattern as Allow/Deny). The badge label should be visually distinct — "override" — so the history log is readable.

**3. Button placement and label**
The override action is an escape hatch, not a primary decision. It should be visually secondary to the three main buttons. Label: "Override" (or "→ Terminal"). Placed after Deny in the actions row, styled differently (e.g. muted/ghost).

---

## Tasks

1. **Add Override button to `createPermCard`** — A fourth button in the `.perm-card-actions` row calls `decide('passthrough', 'override', 'override')`. Style it as a secondary/ghost action to signal it's an escape hatch, not a standard decision.

2. **Add a history badge style for override** — The existing badge classes are `allowed`, `session`, `denied`. Add an `override` badge variant so the history popup shows override entries distinctly.

3. **Update the roadmap** — Mark Slice 13 complete and add the plan link.

---

## Done Criteria

- [x] A pending permission card shows four buttons: Allow, Session, Deny, Override
- [x] Clicking Override removes the card and adds an "override" history entry
- [x] After Override is clicked, Claude Code displays the full interactive permission question in the terminal
- [x] The Override badge in the history popup is visually distinct from allow/session/deny badges
- [x] Allow, Session, and Deny still work as before

