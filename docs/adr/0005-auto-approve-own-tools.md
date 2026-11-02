# ADR-0005: Auto-approve the plugin's own MCP tools with a PreToolUse hook

- Status: Accepted
- Date: 2026-11-02

## Context
By default every MCP tool call asks for permission. An interview and a search use dozens of calls, many inside subagents. For a non-technical person, a stream of prompts is confusing and teaches them to click "allow" without reading.

A plugin cannot ship permission rules: plugin `settings.json` honours only `agent` and `subagentStatusLine`. Skill `allowed-tools` grants last only for one turn.

## Decision
`hooks/hooks.json` registers a PreToolUse hook for `mcp__plugin_pathfinder_pathfinder__.*` that answers `permissionDecision: "allow"`. It is a one-line `echo`, valid in bash and PowerShell, so it needs no runtime.

The tools are built to deserve that trust:
- they write only inside the Pathfinder folder;
- they contact only the fixed list of job sites, with search terms only;
- `import_resume` reads only resume file types under 15 MB;
- `open_path` opens only files inside the folder.

The README states this.

## Consequences
- Pathfinder's own steps never prompt. Everything else still does: the runtime installer, WebSearch and any Read outside the project.
- Every new tool must keep these limits. A tool that could touch arbitrary paths or URLs must not join the matcher.
