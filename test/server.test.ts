import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { parse } from "yaml";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixture, json } from "./helpers.js";

// Smoke test of the bundled server exactly as Claude Code starts it: `node dist/server.mjs`.
const SERVER = fileURLToPath(new URL("../dist/server.mjs", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "pathfinder-smoke-"));
let client: Client;

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const result = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
  const text = result.content[0]!.text;
  if (result.isError) throw new Error(text);
  return JSON.parse(text);
};

describe.skipIf(!existsSync(SERVER))("bundled MCP server", () => {
  beforeAll(async () => {
    client = new Client({ name: "smoke", version: "0" });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { ...process.env, PATHFINDER_HOME: root } as Record<string, string> }));
  });
  afterAll(async () => client?.close());

  it("lists the tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["setup_status", "import_resume", "save_profile", "save_preferences", "build_resume", "search_jobs", "get_jobs", "save_scores", "save_cover_letter", "export_jobs", "update_job_status", "open_path"]),
    );
  });

  it("reports status and creates the folder", async () => {
    const status = await call("setup_status");
    expect(status).toMatchObject({ workspace: root, has_profile: false, node_ok: true });
    expect(existsSync(join(root, "LEIA-ME.txt"))).toBe(true);
  });

  it("saves the profile and preferences, then builds the resume", async () => {
    const saved = await call("save_profile", { profile: parse(fixture("perfil.yaml")) });
    expect(saved.roles).toBe(2);
    await call("save_preferences", { preferences: { target_titles: ["Analista de Marketing"], area: "marketing", market_keywords: ["CRM", "HubSpot", "SEO"] } });
    const built = await call("build_resume", { resume: json("curriculo-pt.json") });
    expect(built.ok).toBe(true);
    expect(built.files.every((file: string) => existsSync(file))).toBe(true);
    expect(built.market_keywords.missing).toEqual(["SEO"]);
  });

  it("rejects a resume with an invented number", async () => {
    const doc = json("curriculo-pt.json");
    doc.experience[0].bullets[0].text = "Liderou a migração de 90.000 contatos para o HubSpot.";
    const built = await call("build_resume", { resume: doc });
    expect(built.ok).toBe(false);
    expect(JSON.stringify(built.errors)).toContain("90.000");
  });

  it("imports a pasted resume", async () => {
    const imported = await call("import_resume", { text: "Maria Exemplo\nmaria@example.com\nExperiência\nAnalista de Marketing 2022 - atual\nFormação\nUSP 2018" });
    expect(imported.diagnosis.email).toBe(true);
  });

  it("exports the job list and the tracker from saved jobs", async () => {
    const now = new Date().toISOString();
    const job = {
      id: "gupy:1", ref: "abc123", source: "gupy", company: "Escola Gama", title: "Analista de CRM", url: "https://gama.gupy.io/job/1",
      location: "Remoto · Brasil", workplace: "remote", track: "national", language: "pt", firstSeen: now, lastSeen: now,
      eligibility: "eligible", reasons: ["remoto no Brasil"], prescore: 70, matched: ["CRM"], score: 82, verdict: "apply",
      why: "Pede CRM e automação, que você usa há 4 anos.", gaps: [], status: "new",
    };
    mkdirSync(join(root, "dados", "buscas"), { recursive: true });
    writeFileSync(join(root, "dados", "vagas.json"), JSON.stringify({ version: 1, jobs: { [job.id]: job } }));
    writeFileSync(
      join(root, "dados", "buscas", "2026-11-02T10-00.json"),
      JSON.stringify({ id: "2026-11-02T10-00", createdAt: now, scope: "both", runs: [{ source: "gupy", jobs: 1, seconds: 1 }], funnel: { fetched: 1, unique: 1, eligible: 1, unclear: 0, ineligible: 0 }, candidates: [job.id], postings: {} }),
    );
    const letter = await call("save_cover_letter", { ref: "abc123", language: "pt", text: Array(15).fill("Trabalho com CRM e automação de marketing há quatro anos na Escola Alfa.").join(" ") });
    expect(letter.files.every((file: string) => existsSync(file))).toBe(true);
    const exported = await call("export_jobs");
    expect(exported).toMatchObject({ listed: 1, tracker_rows: 1, tracker_locked: false });
    expect(existsSync(exported.pdf)).toBe(true);

    await call("update_job_status", { ref: "abc123", status: "Aplicada" });
    const again = await call("export_jobs");
    expect(again.tracker_rows).toBe(1);
  });
});
