# Architecture decisions

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-plugin-with-a-bundled-mcp-server.md) | Ship as a Claude Code plugin whose skills and agents use a bundled MCP server | Accepted |
| [0002](0002-private-node-runtime.md) | Run the server on a Node.js runtime in the plugin data folder: the system one if present, else a pinned download | Accepted |
| [0003](0003-pdfkit-instead-of-typst.md) | Render PDFs with pdfkit instead of Typst | Accepted |
| [0004](0004-plain-files-in-documents.md) | Keep the person's data as plain files in Documents/Pathfinder | Accepted |
| [0005](0005-auto-approve-own-tools.md) | Auto-approve the plugin's own MCP tools with a PreToolUse hook | Accepted |
| [0006](0006-free-public-job-sources.md) | Search free public job sources only, Gupy through its portal page | Accepted |
| [0007](0007-one-resume-letters-per-top-job.md) | One resume per person; cover letters only for the top jobs of a search | Accepted |
