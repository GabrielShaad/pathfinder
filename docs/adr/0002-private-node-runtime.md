# ADR-0002: Run the server on a private Node.js runtime in the plugin data folder

- Status: Accepted
- Date: 2026-11-02 (revised 2026-11-04)

## Context
The MCP server needs Node.js 22 or newer. The native Claude Code installer does not ship Node, and the people this plugin is for may not know what Node is.

A system install has three problems:
- It needs administrator rights (UAC on Windows, a password on macOS).
- It changes PATH, which running apps only see after a restart.
- The macOS desktop app may not see `/usr/local/bin` at all.

## Decision
- `.mcp.json` starts the server with `${CLAUDE_PLUGIN_DATA}/node/bin/node`. That is a private runtime in the plugin's persistent data folder, which is kept across updates and deleted on uninstall.
- `scripts/install-node.sh` (macOS, Linux) and `scripts/install-node.ps1` (Windows) fill that folder:
  1. A Node.js 22+ already on the computer (PATH, or the official installer's usual folders) is linked (Unix) or copied (Windows). Nothing is downloaded. The README asks people to install Node.js first, so this is the expected path.
  2. Otherwise they download a pinned LTS build (v24.22.2) from nodejs.org. They check its SHA-256 against hashes embedded in the scripts, then swap it into place. On Windows they copy `node.exe` to `bin/` and hard-link `bin/node` to it.
  3. Either way, they finish by starting `dist/server.mjs` from `<data>/node/bin/node`, the same command `.mcp.json` runs, through `scripts/verify-server.mjs`. Only a server that answers `initialize` produces the final `PRONTO:` line.
- The scripts refuse a destination that is empty, relative, or still holds a `$` placeholder. Installing anywhere other than the folder `.mcp.json` reads cannot fix anything.
- The `preparar` skill explains the step in plain Portuguese, asks for consent, and runs the one matching command. The person approves it in the normal permission prompt. The other skills load it through the Skill tool, because only skill loading fills in `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}`: the Bash tool's environment does not have them.
- The skill checks first (`--check`). When the runtime is already there but the tools are missing, it never reinstalls or sends the person to yet another new session: it runs `--verify` and, if the server starts, asks for a full restart of the app, then for a bug report.

### Why the revision
The first version ended at "OK, open a new session". On a desktop app without Node.js, each new session found no tools, ran the installer again, reported success and asked for another session, forever. The skill had no ground truth: it could not tell "installed in the right folder and working" from "the script ran", and a missing tool always led back to installing. The `PRONTO:` line, the `--check`/`--verify` branches and the placeholder guard give it that ground truth.

## Consequences
- No admin rights, no PATH changes, and the same path on every OS.
- After installing, the MCP connection must be reloaded once: `/mcp` → Reconnect in the CLI, or a new session in the desktop app (a full app restart when that is not enough).
- A linked system Node follows the person's own upgrades. If it is removed or drops below 22, `--check` reports it missing and the skill installs again.
- Verified on 2026-11-02 with `claude --plugin-dir`: `${CLAUDE_PLUGIN_DATA}` is expanded in the MCP `command` and in skill bodies.
- Still to verify on real Windows: that the spawn resolves `bin/node` without `.exe`. The hard link covers both behaviours.
- Bumping Node means updating the version and the six hashes in both scripts.
- CI sets `PATHFINDER_NODE_SKIP_SYSTEM=1` to test the download path on runners that already have Node.
