# Slice 7 — Linux Support

**Roadmap:** docs/roadmaps/2026-04-06-gada-terminal.md
**Status:** [-] Deferred — development resources (node-pty has no prebuilt Linux binaries for Electron 41; requires build tools)

## Objective

The app runs correctly on Linux: the titlebar overlay applies the accent color, Claude is found on the path, and a DEB or RPM package can be produced. All Linux-specific branches are verified by running the app on a Linux machine.

## Key Decisions

**`setAccentColor()` is a Windows-only API.** The call in `main.ts` is currently unguarded. On Linux it will throw at runtime. This must be wrapped in a `process.platform === 'win32'` check before any Linux testing can happen.

**Packaging requires a Linux host.** `MakerDeb` and `MakerRpm` must run on Linux — Electron Forge cannot cross-compile them from Windows. WSL2 (with WSLg on Windows 11) can run the app and produce packages. Linux Mint is available for final real-world verification. The makers can be added to `forge.config.ts` now; the actual build and test runs happen in those environments.

**DEB vs RPM.** Both can be included as they target different distros (Debian/Ubuntu vs Fedora/RHEL). No meaningful tradeoff — ship both.

**App icon.** Linux packaging requires a PNG icon. If the project does not yet have one, a PNG must be added before a DEB/RPM can be built. Windows uses `.ico`; macOS uses `.icns`; Linux uses `.png`.

## Tasks

1. Guard the `setAccentColor()` call in `main.ts` behind `process.platform === 'win32'`
2. Add `MakerDeb` and `MakerRpm` to `forge.config.ts`
3. Add a PNG app icon and wire it up to the packager config
4. Run the app on Linux and verify: launch screen, terminal, sidebar panels, accent color in titlebar, permission approval flow
5. Produce a DEB package on Linux and verify it installs and launches correctly

## Done Criteria

- [ ] App launches on Linux without errors in the main process console
- [ ] Accent color picker changes the titlebar color on Linux
- [ ] Claude is found and spawned correctly (path resolution works)
- [ ] All four sidebar panels receive live data during a session
- [ ] Permission approval flow works end-to-end
- [ ] `npm run make` on Linux produces a `.deb` file that installs and runs
