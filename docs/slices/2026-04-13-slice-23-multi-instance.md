# Slice 23 — Multiple Instance Support

**Roadmap:** [Gada Terminal Roadmap](../roadmaps/2026-04-06-gada-terminal.md)
**Status:** [ ] Not started

---

## Objective

Two or more instances of Gada Terminal can run simultaneously without GPU cache or disk cache errors. Each instance gets its own isolated Electron cache directory. Settings (recent folders, panel layouts, widget grants) are shared across all instances from a single common location, so changes in one instance are visible to others on next read.

---

## Key Decisions

- **Split userData into two paths** — Electron's internal caches (GPU shader cache, network cache) must be per-instance. User settings must remain in a single shared location. The current code already passes `userDataPath` explicitly to all persistence functions, so pointing Electron's `userData` to a per-instance subdirectory and keeping a separate `settingsPath` for persistence is straightforward.
- **Instance numbering via lock files** — Each instance claims a slot (0, 1, 2…) by creating a lock file in the shared directory. On exit, the lock is released. This is simple, requires no IPC between instances, and survives crashes gracefully (stale locks are detected by checking if the PID in the lock file is still alive).
- **No single-instance enforcement** — `app.requestSingleInstanceLock()` is deliberately not used; we want multiple instances to coexist.

---

## Tasks

1. **Implement instance slot acquisition** — On startup, scan the shared directory for existing instance lock files, find the lowest unclaimed slot, write a lock file containing the current PID, and remember the slot number for this process lifetime.
2. **Set per-instance userData path** — Before `app.ready`, call `app.setPath('userData', ...)` with a path derived from the slot number (e.g. `<sharedDir>/instance-0`). This redirects Electron's GPU and network caches away from the shared directory.
3. **Keep a separate settingsPath** — The `userDataPath` variable used by all persistence functions continues to point to the shared base directory, not the per-instance directory.
4. **Release the lock on exit** — On `app.on('will-quit')`, delete the lock file so the slot can be reused by a future instance.
5. **Handle stale locks** — When scanning for a free slot, treat a lock file whose PID is no longer running as unclaimed and reclaim it.

---

## Done Criteria

- [ ] Starting two instances simultaneously produces no GPU cache or disk cache errors in either window
- [ ] Both instances open and display the launch screen correctly
- [ ] Recent folders and folder settings are shared — a folder opened in instance A appears in instance B's recent list on next launch
- [ ] Closing one instance does not affect the other
- [ ] After both instances close and the app is restarted, no stale lock files remain and slot 0 is claimed again
