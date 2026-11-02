# ADR-0004: Keep the person's data as plain files in Documents/Pathfinder

- Status: Accepted
- Date: 2026-11-02

## Context
Horizon stores jobs in SQLite (`node:sqlite`) inside the repository. Pathfinder's users never open a repository. They need to find their resume and job list easily, and their data must survive plugin updates. The plugin folder is replaced on every update.

## Decision
- **Location:** one visible folder per person, `Documents/Pathfinder`.
  - Windows: OneDrive's Documents first, when present.
  - Linux: `XDG_DOCUMENTS_DIR`.
  - `PATHFINDER_HOME` overrides it.
  - A `userConfig` option was tried. An unset `${user_config.*}` silently kept the MCP server from starting, so it was dropped.
- **Contents:**
  - `Meu currículo/`: the resume PDF and DOCX, per language;
  - `Vagas/`: the list per search, the cumulative `Acompanhamento de vagas.xlsx`, and `Cartas/`;
  - `dados/`: `perfil.yaml`, `preferencias.yaml`, `vagas.json` (seen jobs, scores, statuses), `empresas.json` (company boards found by web search) and `buscas/<timestamp>.json` (the postings of each search).
- Every write is atomic (temporary file, then rename).
- The spreadsheet is read back before each export, so the Status and notes the person typed win.

## Consequences
- No native modules, and the data is readable without the plugin.
- When Excel locks the spreadsheet (Windows), the export writes a dated copy and says so.
- Only jobs that pass the filters are kept, never the thousands fetched.
