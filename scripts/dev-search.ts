// Maintainer tool: runs a real search against the live sources with the synthetic
// test profile, in a throwaway folder. Usage:
//   pnpm tsx scripts/dev-search.ts [national|global|both] [area] ["Title 1;Title 2"]
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { saveJobs } from "../src/state/store.js";
import { savePreferencesTool, saveProfileTool, searchJobs } from "../src/server/tools.js";
import { workspace } from "../src/state/workspace.js";

const [scope = "both", area = "marketing", titles = "Analista de Marketing;Marketing Analyst;Analista de CRM;CRM Specialist"] = process.argv.slice(2);
const root = process.env.PATHFINDER_HOME ?? mkdtempSync(join(tmpdir(), "pathfinder-dev-"));
const ctx = { ws: workspace(root), now: () => new Date() };
saveProfileTool(ctx, parse(readFileSync(new URL("../test/fixtures/perfil.yaml", import.meta.url), "utf8")));
savePreferencesTool(ctx, {
  scope: scope as "national" | "global" | "both",
  area,
  target_titles: titles.split(";"),
  title_keywords: ["CRM", "marketing"],
  seniority: "mid",
});
saveJobs(ctx.ws, { version: 1, jobs: {} });
const started = Date.now();
const result = await searchJobs(ctx);
console.log(JSON.stringify({ seconds: (Date.now() - started) / 1000, runs: result.runs, funnel: result.funnel, top_ineligible_reasons: result.top_ineligible_reasons }, null, 1));
for (const job of (result.candidates ?? []).slice(0, 25)) console.log(`${job.prescore}\t${job.eligibility}\t${job.title} — ${job.company} | ${job.location} | ${job.notes.join("; ")}`);
console.log("folder:", root);
