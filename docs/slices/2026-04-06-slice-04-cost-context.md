# Slice 4 — Cost & Context Panels

**Status:** complete
**Observable result:** Two sidebar sections show real-time token counts, cost per request, and a color-coded context window progress bar — all updated live as Claude works via OTLP telemetry.

---

## Files

| File | Change |
|---|---|
| `src/types.d.ts` | Add `ApiRequestEvent`; add `onApiRequest` to `electronAPI` |
| `src/hookServer.ts` | Replace OTLP stub with real parser; add `onApiRequest` callback param |
| `src/main.ts` | Wire `onApiRequest` callback; add OTLP env vars to PTY spawn |
| `src/preload.ts` | Expose `onApiRequest` subscription |
| `src/renderer.ts` | Cost/context state, formatters, panel update functions, subscription |
| `index.html` | Cost and context panel markup + CSS |

---

## Build steps

- [x] Step 1 — `src/types.d.ts`: add `ApiRequestEvent` and `onApiRequest`
- [x] Step 2 — `src/hookServer.ts`: replace OTLP stub with `parseOtlpLogs` + `extractAttrs`
- [x] Step 3 — `src/main.ts`: wire callback + OTLP env vars in PTY spawn
- [x] Step 4 — `src/preload.ts`: expose `onApiRequest`
- [x] Step 5 — `index.html`: cost and context panel markup + CSS
- [x] Step 6 — `src/renderer.ts`: state, formatters, panel updates, subscription

---

## Key decisions

1. **`timestamp` is stamped in main.ts** — OTLP `timeUnixNano` overflows JS safe integers; `Date.now()` at parse time is simpler and sufficient.
2. **Context uses latest request** — context window state is per-request, not cumulative; `lastInputTokens + lastCacheRead + lastCacheWrite` reflects current state.
3. **`cache_creation_tokens` → Cache Write** — Anthropic API naming vs display label mapping.
4. **Cost/Context toggles already wired** — buttons exist and click handlers work; sections just need content.
