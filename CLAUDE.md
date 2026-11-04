# Pathfinder (maintainers)

Claude Code plugin, shared publicly, derived from the private Horizon project. People in Brazil, in any field, many non-technical: interview → one ATS resume (pt + en) → on-demand job search → PDF list, XLSX tracker, cover letters. This file is for working on the repo; it is not loaded for plugin users.

## Hard rules
- **Never invent experience.** Resumes and letters only select and rephrase profile facts. `verifyResume` enforces fact ids, numbers and skills; the reviewer agent checks meaning.
- **Never apply or send anything** for the person.
- **Zero cost, no API keys.** LLM work runs as plugin subagents on the person's subscription. Job sources are free and public (ADR-0006). No LinkedIn or Indeed scraping.
- **The person's data stays local**, in `Documents/Pathfinder` (ADR-0004). Requests to job sites carry search terms only.
- **MCP tools are auto-approved** (ADR-0005). Every tool must write only inside the workspace, fetch only fixed job hosts, and validate its input with zod.
- **Cross-platform.** No shell in the server. Paths go through `node:path`. File names go through `safeFileName`. The installers exist for bash and for PowerShell 5.1, and the PowerShell one stays ASCII-only.
- Code, comments and docs in English. User-facing text (skills' spoken lines, PDFs, XLSX, eligibility reasons) in Portuguese (Brazil).

## Layout
- `src/core`:
  - `ProfileSchema` with `i18n`, `ResumeDocSchema`, `verifyResume`, `lintProfile`, `keywordCoverage`;
  - `resolveResume` with labels per language in `i18n.ts`;
  - `PreferencesSchema`;
  - `assessEligibility` and `prescore`, driven by preferences;
  - `detectLanguage`, and numbers in both pt and en formats.
- `src/sources`: ATS boards, Himalayas, Jobicy, WWR, Remotive, Remote OK, Gupy (`gupy.ts`), `planSearch` and `runSearch`, `atsLink`.
- `src/render`: pdfkit resume, letters and job list, `docx`, `exceljs` tracker, `checkPdf` read-back, resume text extraction and diagnosis.
- `src/state`: workspace paths, atomic writes, YAML/JSON store.
- `src/server`: `tools.ts` (pure, tested) and `index.ts` (MCP registration).
- `skills/`, `agents/`, `hooks/hooks.json`, `.mcp.json`, `.claude-plugin/`.
- `scripts/install-node.{sh,ps1}`: the runtime in `${CLAUDE_PLUGIN_DATA}/node`, system Node first, then a pinned download; `scripts/verify-server.mjs` proves the server starts from it and prints the `PRONTO:` line the `preparar` skill trusts (ADR-0002).
- `config/areas.json` and `config/companies-tech.json`.
- `dist/server.mjs`: the committed bundle.

## Commands
| Task | Command |
|---|---|
| Everything | `pnpm check` |
| Tests / types | `pnpm test` / `pnpm typecheck` |
| Bundle (commit the result) | `pnpm build` |
| Live search with the synthetic profile | `pnpm tsx scripts/dev-search.ts <national\|global\|both> <area> "Title;Title"` |
| Try the plugin | `claude --plugin-dir .` (the runtime lands in `~/.claude/plugins/data/pathfinder-inline`) |
| Validate the manifest | `claude plugin validate .` |
| Icon | `node scripts/make-icon.mjs` |

## Releasing
1. Bump `version` in both `package.json` and `.claude-plugin/plugin.json`. CI checks that they match.
2. Run `pnpm build`.
3. Commit with `dist/`.
4. Tag `vX.Y.Z`.

A new Node runtime means changing `NODE_VERSION` and all six hashes in both installers.
