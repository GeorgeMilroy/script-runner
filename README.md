# Script Runner GUI

A polished VS Code extension that provides a GUI for discovering and running NPM scripts with real-time output, ANSI color support, and monorepo awareness.

## Features

- **Auto-discovery** — Automatically finds scripts from all `package.json` files in your workspace, including nested packages (monorepos)
- **One-click run/stop** — Run any script with a single click; stop running scripts instantly
- **Real-time output** — View script output as it streams, with full ANSI color support
- **Smart environment tags** — Scripts are automatically tagged based on their name, with both an environment (dev, staging, prod) and an action (build, test, lint, deploy, seed) where the name carries each — so `ship:all:prod` reads as **prod · deploy**
- **Production safeguards** — Filter tabs group scripts by target environment, and any script tagged `prod` asks for confirmation — showing the exact command — before it runs
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
| Status bar | Click **▶ Scripts** at the bottom left |
| Command Palette | `Script Runner: Open Script Runner` |
| Keyboard shortcut | `Ctrl+Shift+R` (`Cmd+Shift+R` on macOS) |
| Editor title button | Click the icon when viewing a `package.json` |
| Explorer | Right-click any `package.json` → **Open Script Runner** |

From the panel you can:

1. **Run** a script by clicking the play button on its card
2. **Stop** a running script with the stop button
3. **Expand/collapse** a card to show or hide its output
4. **Filter** scripts using the search bar in the toolbar
5. **Send input** to a running script via the input bar at the bottom of its output
6. **Open detected URLs** (like `localhost` dev servers) with a single click
7. **Clear output** using the trash icon on a script card
8. **Refresh** the script list with the refresh button in the toolbar

## Set Up Your package.json for Script Runner

Script Runner works out a script's environment badge, its filter tab, and whether it asks for confirmation entirely from the script's **name**. Paste the prompt below into Claude Code, ChatGPT, Copilot, or any coding agent, and it will rename and organise the scripts in your `package.json` to match.

```text
Rename and organise the scripts in this project's package.json files so they work well with the Script Runner VS Code extension.

Script Runner lowercases each script's NAME and looks for these keywords as plain substrings. In each list, the first match wins:

Environment (sets the filter tab and the env badge):
1. prod, production -> prod: asks for confirmation, showing the exact command, before every run
2. staging, stage -> staging
3. dev, start, serve, watch, emulator -> dev

Action (sets the second badge):
1. deploy, release, ship, publish
2. build, compile, bundle
3. test, spec, e2e, coverage
4. lint, format, prettier, eslint
5. seed, migrate, generate
6. preview

Rules:
1. Name scripts <action>[:<scope>]:<env>, e.g. deploy:api:prod, build:staging, dev:web. Leave the env off only for scripts that touch no deployed environment (lint, test, format).
2. Every script that can affect production must have "prod" in its name, because the name is the only thing that triggers the confirmation dialog. That includes wrapper scripts that call a prod script, and any pre/post hook that does.
3. Make sure no other script contains one of those keywords by accident, since matching is by substring: "build:products" reads as prod, "lint-staged" reads as staging, "build:server" reads as dev. Rename those.
4. Use one script per environment, with the target hard-coded in the command (--project my-app-prod, --mode production). Script Runner cannot pass arguments or choose an environment, so never let the current .env file or the logged-in CLI account decide where a script runs.
5. Scripts must run with no arguments, and without arrow-key menus or single-keypress prompts (output is piped, not a TTY). Use --yes / --ci / --non-interactive flags where the tool supports them.
6. Commands must work on both Windows and macOS/Linux: cross-env instead of FOO=bar, rimraf instead of rm -rf, and concurrently or npm-run-all for parallel tasks.
7. Dev servers should keep printing their URL, so Script Runner can offer the open button.
8. In a monorepo, keep each script in the package.json of the package it belongs to.

Then show me:
- the updated scripts block for each package.json you changed
- a table of every script with the env and action badge it will get, flagging anything that can reach production but is not named prod
- a list of renames, and update every reference to the old names (other scripts, CI workflows, Husky hooks, Dockerfiles, README)
```

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `scriptRunner.packageManager` | `auto` | Package manager to use (`auto`, `npm`, `yarn`, `pnpm`). `auto` detects based on lock files. |
| `scriptRunner.maxOutputLines` | `1000` | Maximum number of output chunks to keep per script |
| `scriptRunner.clearOutputOnRerun` | `true` | Clear previous output when re-running a script |
| `scriptRunner.scanNested` | `true` | Scan for nested `package.json` files (monorepo support) |
| `scriptRunner.showStatusBarItem` | `true` | Show a Script Runner button in the status bar for one-click access |

## Requirements

- VS Code 1.85.0 or later
- A workspace containing at least one `package.json` with scripts

## License

[MIT](LICENSE)
