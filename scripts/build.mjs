// Bundles the MCP server into one file (dist/server.mjs) so the plugin needs no
// `npm install` on the person's computer: only the private Node runtime.
import { build } from "esbuild";

await build({
  entryPoints: ["src/server/index.ts"],
  outfile: "dist/server.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  legalComments: "external",
  minify: true,
  keepNames: true,
  logLevel: "info",
  // pdfkit and exceljs are CommonJS and expect require/__filename/__dirname.
  banner: {
    js: [
      "import { createRequire as __pfCreateRequire } from 'node:module';",
      "import { fileURLToPath as __pfFileURLToPath } from 'node:url';",
      "import { dirname as __pfDirname } from 'node:path';",
      "const require = __pfCreateRequire(import.meta.url);",
      "const __filename = __pfFileURLToPath(import.meta.url);",
      "const __dirname = __pfDirname(__filename);",
    ].join("\n"),
  },
});
