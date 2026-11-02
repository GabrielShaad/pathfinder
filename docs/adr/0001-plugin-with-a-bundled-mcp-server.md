# ADR-0001: Ship as a Claude Code plugin with a bundled MCP server

- Status: Accepted
- Date: 2026-11-02

## Context
Pathfinder is shared with people who are not technical, on macOS, Windows and Linux, in the Claude Code CLI and in the desktop app. Its parent project (Horizon) is a pnpm monorepo that the agents drive through `pnpm horizon ...` shell commands. That needs a repository checkout, pnpm, tsx and a POSIX shell. On Windows the shell may be Git Bash or PowerShell, and the commands are quoted differently in each.

## Decision
Distribute Pathfinder as a Claude Code plugin from a public GitHub repository that is both the marketplace and the plugin (`"source": "./"`). It has three parts:
- **Skills** (`skills/`) hold the conversation flows: `comecar`, `buscar-vagas`, `curriculo` and `preparar`.
- **Subagents** (`agents/`) do the LLM work on the person's subscription: `resume-writer`, `reviewer`, `job-scorer` and `letter-writer`.
- **A stdio MCP server** owns every deterministic step and every file it reads or writes: fact check, rendering, search, filters, export. It is bundled by esbuild into one committed file, `dist/server.mjs`, so no `npm install` happens on the person's computer.

## Consequences
- The same tools work on every OS and in the CLI and the desktop app, with inputs and outputs validated by zod.
- Agents need neither Bash nor Write. The only shell command is the one-time runtime install (ADR-0002).
- `dist/` must be rebuilt and committed on every change. CI fails when it is stale.
- Plugin MCP tools are named `mcp__plugin_pathfinder_pathfinder__<tool>`.
- Installing differs between the desktop app and the terminal:
  - **Desktop app (the README's main path):** people add the marketplace in **Customize > Plugins > Add > Add marketplace** (`GabrielShaad/pathfinder`). The plugin is then saved to their claude.ai account and reaches Claude Code, including the desktop app's Code tab, as `pathfinder@synced` at the next session start (claude.com/docs/plugins/platform-support). `/plugin` commands are not available in the Code tab (code.claude.com/docs/en/plugins/troubleshooting).
  - **Terminal:** `/plugin marketplace add` + `/plugin install`.
- An account-level install also loads the skills in claude.ai chat and in Cowork, where Pathfinder cannot work. Every skill therefore opens with a guard that sends the person to the Code tab.
