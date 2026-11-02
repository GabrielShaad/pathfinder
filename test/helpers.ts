import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { PreferencesSchema, ProfileSchema, ResumeDocSchema, type Preferences, type PreferencesInput } from "../src/core/index.js";

export const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
export const json = (name: string) => JSON.parse(fixture(name));

export const profile = () => ProfileSchema.parse(parse(fixture("perfil.yaml")));
export const resumeDoc = () => ResumeDocSchema.parse(json("curriculo-pt.json"));

export const prefs = (overrides: Partial<PreferencesInput> = {}): Preferences =>
  PreferencesSchema.parse({
    scope: "both",
    workplace: "remote",
    city: "São Paulo",
    area: "marketing",
    target_titles: ["Analista de Marketing", "Marketing Analyst", "Analista de CRM", "CRM Specialist"],
    title_keywords: ["CRM", "marketing automation", "e-mail marketing"],
    seniority: "mid",
    ...overrides,
  });

// Where tests write files; PATHFINDER_TEST_OUT keeps them for a look.
export const outDir = () => process.env.PATHFINDER_TEST_OUT ?? mkdtempSync(join(tmpdir(), "pathfinder-test-"));
