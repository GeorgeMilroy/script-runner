# Script Runner

A polished VS Code extension that provides a GUI for discovering and running NPM scripts with real-time output, ANSI color support, and monorepo awareness.

## Features

- **Auto-discovery** — Automatically finds scripts from all `package.json` files in your workspace, including nested packages (monorepos)
- **One-click run/stop** — Run any script with a single click; stop running scripts instantly
- **Real-time output** — View script output as it streams, with full ANSI color support
- **Smart environment tags** — Scripts are automatically tagged based on their name (dev, build, test, lint, prod, staging, deploy, etc.)
- **URL detection** — Automatically detects URLs in script output (e.g. dev server addresses) and offers a quick-open button
- **Interactive stdin** — Send input to running scripts directly from the UI
- **Filter scripts** — Quickly filter scripts by name or command with the built-in search
- **Package manager detection** — Automatically detects npm, yarn, or pnpm based on lock files, or set it manually
- **Persistent state** — Output and panel state are preserved across VS Code restarts
- **Auto-refresh** — Watches for `package.json` changes and refreshes the script list automatically

## Usage

Open the Script Runner panel using any of these methods:

| Method | Action |
|---|---|
| Command Palette | `Script Runner: Open Script Runner` |
| Keyboard shortcut | `Ctrl+Shift+R` (`Cmd+Shift+R` on macOS) |
| Editor title button | Click the icon when viewing a `package.json` |

From the panel you can:

1. **Run** a script by clicking the play button on its card
2. **Stop** a running script with the stop button
3. **Expand/collapse** a card to show or hide its output
4. **Filter** scripts using the search bar in the toolbar
5. **Send input** to a running script via the input bar at the bottom of its output
6. **Open detected URLs** (like `localhost` dev servers) with a single click
7. **Clear output** using the trash icon on a script card
8. **Refresh** the script list with the refresh button in the toolbar

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `scriptRunner.packageManager` | `auto` | Package manager to use (`auto`, `npm`, `yarn`, `pnpm`). `auto` detects based on lock files. |
| `scriptRunner.maxOutputLines` | `1000` | Maximum number of output chunks to keep per script |
| `scriptRunner.clearOutputOnRerun` | `true` | Clear previous output when re-running a script |
| `scriptRunner.scanNested` | `true` | Scan for nested `package.json` files (monorepo support) |

## Requirements

- VS Code 1.85.0 or later
- A workspace containing at least one `package.json` with scripts

## License

[MIT](LICENSE)
