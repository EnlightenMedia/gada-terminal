# Gada Terminal

A desktop app that wraps [Claude Code](https://claude.ai/code) with a real-time monitoring sidebar. Built with Electron, xterm.js, and node-pty.

## Features

- **Full-fidelity terminal** — xterm.js + node-pty with copy/paste, file drag-and-drop, and proper resize handling
- **Live tool feed** — every file read, bash command, and web search shown with timestamp and status as Claude works
- **Cost & context tracking** — real-time token counts, per-request cost, and a color-coded context window progress bar
- **Permission approval** — risky tool calls surface as sidebar cards; you choose Allow, Allow for session, or Deny
- **Launch screen** — pick a working directory, choose model/effort/permission mode, and configure plugins through a GUI; settings persist per folder
- **Plugin framework** — extend the sidebar with third-party panels via a sandboxed iframe API (coming in Slice 7)

## Requirements

- [Claude Code CLI](https://claude.ai/code) installed and on your PATH
- Node.js 18+

## Getting Started

```bash
# Install dependencies
npm install

# Run in development
npm start

# Build a distributable
npm run make
```

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Electron |
| Terminal | xterm.js + node-pty |
| Build | Electron Forge + Vite |
| Language | TypeScript |

## Widget Development

Widgets are directories containing a `widget.json` manifest and an `index.js` entry file. The entry file runs in a sandboxed iframe and communicates with the host via `postMessage` and the `WidgetAPI`. See the [widget authoring guide](WIDGET_AUTHORING.md) for the full API reference and a working example.

## Roadmap

| # | Slice | Status |
|---|---|---|
| 1 | Working Terminal — xterm.js + node-pty, copy/paste, drag-and-drop, resize | Done |
| 2 | Launch Screen — folder picker, model/effort/permission mode, per-folder persistence | Done |
| 3 | Live Tool Feed — real-time sidebar feed of every tool call via HTTP hooks | Done |
| 4 | Cost & Context Panels — token counts, per-request cost, context window progress bar | Done |
| 5 | Permission Approval — sidebar cards for risky tool calls with Allow/Deny | Done |
| 6 | Persistence & Polish — accent color, panel reorder/hide, recent plugins survive restarts | Done |
| 7 | Plugin Loader — scan a `plugins/` directory, load manifests, render third-party panels | Planned |
| 8 | Full PanelAPI & Permissions — write capabilities with user-granted permission prompts | Planned |
| 9 | Plugin Management UI — list plugins, toggle enabled/disabled, revoke permissions | Planned |
| 10 | Linux Support | Deferred |
| 11 | macOS Support | Deferred |

## Development Process

Gada Terminal is built using the [Slice Flow](https://github.com/EnlightenMedia/slice-flow) workflow plugin for Claude Code — an iterative delivery method that cuts vertically through all layers in each slice, ensuring every increment is runnable and demonstrable.

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE)
