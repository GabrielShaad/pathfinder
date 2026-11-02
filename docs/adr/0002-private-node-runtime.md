# ADR-0002: Run the server on a private Node.js runtime in the plugin data folder

- Status: Accepted
- Date: 2026-11-02

## Context
The MCP server needs Node.js 22 or newer. The native Claude Code installer does not ship Node, and the people this plugin is for may not know what Node is.

A system install has three problems:
- It needs administrator rights (UAC on Windows, a password on macOS).
- It changes PATH, which running apps only see after a restart.
- The macOS desktop app may not see `/usr/local/bin` at all.

## Decision
- `.mcp.json` starts the server with `${CLAUDE_PLUGIN_DATA}/node/bin/node`. That is a private runtime in the plugin's persistent data folder, which is kept across updates and deleted on uninstall.
- `scripts/install-node.sh` (macOS, Linux) and `scripts/install-node.ps1` (Windows) download a pinned LTS build (v24.22.2) from nodejs.org. They check its SHA-256 against hashes embedded in the scripts, then swap it into place. On Windows they copy `node.exe` to `bin/` and hard-link `bin/node` to it.
- The `preparar` skill explains the step in plain Portuguese, asks for consent, and runs the one matching command. The person approves it in the normal permission prompt.
- **Plan B** for blocked downloads: the person installs Node.js with the official installer, and the script links (Unix) or copies (Windows) that `node` into the private location (`--use-system` / `-UseSystem`).

## Consequences
- No admin rights, no PATH changes, and the same path on every OS.
- After installing, the MCP connection must be reloaded once: `/mcp` → Reconnect in the CLI, or a new session in the desktop app.
- Verified on 2026-11-02 with `claude --plugin-dir`: `${CLAUDE_PLUGIN_DATA}` is expanded in the MCP `command` and in skill bodies.
- Still to verify on real Windows: that the spawn resolves `bin/node` without `.exe`. The hard link covers both behaviours.
- Bumping Node means updating the version and the six hashes in both scripts.
