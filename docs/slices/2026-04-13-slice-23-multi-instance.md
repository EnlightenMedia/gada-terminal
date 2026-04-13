# Slice 23 — Multiple Instance Support

**Roadmap:** [Gada Terminal Roadmap](../roadmaps/2026-04-06-gada-terminal.md)
**Status:** [ ] Not started

---

## Objective

Two or more instances of Gada Terminal can run simultaneously without GPU cache or disk cache errors. Each instance is fully independent — its own settings, recent folders, and panel layouts. Instances do not share state.

---

## Key Decisions

- **Fully isolated userData per instance** — Each instance gets its own userData directory derived from a slot number (e.g. `instance-0`, `instance-1`). Electron's caches, settings, and all persistence are scoped to that directory. No shared state between instances.
- **Instance slot via lock files** — Each instance claims the lowest available slot by writing a lock file containing its PID. On exit the lock is released. Stale locks (PID no longer running) are treated as free.
- **No single-instance enforcement** — `app.requestSingleInstanceLock()` is deliberately not used.

---

## Tasks

1. **Implement instance slot acquisition** — On startup, scan a fixed parent directory for existing lock files, find the lowest unclaimed slot, and write a lock file with the current PID.
2. **Set per-instance userData path** — Before `app.ready`, call `app.setPath('userData', ...)` with the slot-specific path. All Electron internals and persistence operate from this directory.
3. **Release the lock on exit** — On `app.on('will-quit')`, delete the lock file so the slot is reused by future instances.
4. **Handle stale locks** — When scanning for a free slot, treat a lock file whose PID is no longer running as unclaimed.

---

## Done Criteria

- [ ] Starting two instances simultaneously produces no GPU cache or disk cache errors in either window
- [ ] Both instances open and display the launch screen correctly
- [ ] Each instance maintains independent settings (recent folders, panel layout, etc.)
- [ ] Closing one instance does not affect the other
- [ ] After all instances close, no stale lock files remain and slot 0 is claimed on next launch
