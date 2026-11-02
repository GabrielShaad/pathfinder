import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { parse, stringify } from "yaml";
import { z } from "zod";
import {
  PreferencesSchema,
  ProfileSchema,
  type JobPosting,
  type Preferences,
  type PreferencesInput,
  type Profile,
  type ProfileInput,
} from "../core/index.js";
import type { WatchedCompany } from "../sources/index.js";
import { writeAtomic, type Workspace } from "./workspace.js";

// Plain files instead of Horizon's SQLite: a JSON map of the jobs the person has
// seen, YAML for the profile and preferences. Small, readable, no native modules.

export const STATUSES = ["new", "interested", "applied", "interview", "offer", "rejected", "dismissed"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  new: "Nova",
  interested: "Quero aplicar",
  applied: "Aplicada",
  interview: "Entrevista",
  offer: "Proposta",
  rejected: "Não avançou",
  dismissed: "Descartada",
};

export const statusFromLabel = (label: string): Status | undefined => {
  const wanted = label.trim().toLowerCase();
  return STATUSES.find((status) => STATUS_LABEL[status].toLowerCase() === wanted || status === wanted);
};

export const TrackedJobSchema = z.object({
  id: z.string(),
  ref: z.string(),
  source: z.string(),
  company: z.string(),
  title: z.string(),
  url: z.string(),
  location: z.string().default(""),
  workplace: z.string().default("unknown"),
  track: z.enum(["national", "global", "none"]).default("none"),
  salary: z.string().optional(),
  postedAt: z.string().optional(),
  language: z.string().default("unknown"),
  firstSeen: z.string(),
  lastSeen: z.string(),
  eligibility: z.enum(["eligible", "unclear", "ineligible"]),
  reasons: z.array(z.string()).default([]),
  prescore: z.number().default(0),
  matched: z.array(z.string()).default([]),
  score: z.number().optional(),
  verdict: z.enum(["apply", "maybe", "skip"]).optional(),
  why: z.string().optional(),
  gaps: z.array(z.string()).default([]),
  scoredAt: z.string().optional(),
  status: z.enum(STATUSES).default("new"),
  notes: z.string().optional(),
  letter: z.object({ pdf: z.string(), docx: z.string(), language: z.string() }).optional(),
});

export type TrackedJob = z.infer<typeof TrackedJobSchema>;

const JobsStateSchema = z.object({ version: z.literal(1).default(1), jobs: z.record(z.string(), TrackedJobSchema).default({}) });
export type JobsState = z.infer<typeof JobsStateSchema>;

export const refOf = (id: string) => createHash("sha1").update(id).digest("hex").slice(0, 6);

export function formatSalary(job: JobPosting): string | undefined {
  const s = job.salary;
  if (!s) return undefined;
  if (s.text && !s.min && !s.max) return s.text;
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const range = s.min && s.max && s.min !== s.max ? `${fmt(s.min)}–${fmt(s.max)}` : fmt((s.max ?? s.min)!);
  const period = s.period === "hour" ? "/hora" : s.period === "month" ? "/mês" : "/ano";
  return `${s.currency ?? ""} ${range}${period}`.trim();
}

// --- Profile and preferences ------------------------------------------------------

export function loadProfile(ws: Workspace): Profile | undefined {
  if (!existsSync(ws.profile)) return undefined;
  return ProfileSchema.parse(parse(readFileSync(ws.profile, "utf8")));
}

export function saveProfile(ws: Workspace, input: ProfileInput): Profile {
  const profile = ProfileSchema.parse(input);
  writeAtomic(ws.profile, `# Perfil do Pathfinder. Para mudar algo, peça ao Pathfinder ("atualizar meu currículo").\n${stringify(profile, { lineWidth: 0 })}`);
  return profile;
}

export function loadPreferences(ws: Workspace): Preferences | undefined {
  if (!existsSync(ws.preferences)) return undefined;
  return PreferencesSchema.parse(parse(readFileSync(ws.preferences, "utf8")));
}

export function savePreferences(ws: Workspace, input: PreferencesInput): Preferences {
  const prefs = PreferencesSchema.parse(input);
  writeAtomic(ws.preferences, `# Preferências de busca do Pathfinder.\n${stringify(prefs, { lineWidth: 0 })}`);
  return prefs;
}

// --- Jobs ----------------------------------------------------------------------------

export function loadJobs(ws: Workspace): JobsState {
  if (!existsSync(ws.jobsState)) return { version: 1, jobs: {} };
  return JobsStateSchema.parse(JSON.parse(readFileSync(ws.jobsState, "utf8")));
}

export function saveJobs(ws: Workspace, state: JobsState): void {
  writeAtomic(ws.jobsState, JSON.stringify(state, null, 1));
}

export function findJob(state: JobsState, idOrRef: string): TrackedJob | undefined {
  const key = idOrRef.trim();
  return state.jobs[key] ?? Object.values(state.jobs).find((job) => job.ref === key.toLowerCase());
}

// --- Companies found by the person or by web search ------------------------------------

const CompaniesSchema = z.object({ companies: z.array(z.object({ name: z.string(), ats: z.string(), token: z.string() })).default([]) });

export function loadCompanies(ws: Workspace): WatchedCompany[] {
  if (!existsSync(ws.companies)) return [];
  return CompaniesSchema.parse(JSON.parse(readFileSync(ws.companies, "utf8"))).companies as WatchedCompany[];
}

export function addCompanies(ws: Workspace, companies: WatchedCompany[]): WatchedCompany[] {
  const current = loadCompanies(ws);
  const byKey = new Map(current.map((c) => [`${c.ats}:${c.token.toLowerCase()}`, c]));
  for (const company of companies) byKey.set(`${company.ats}:${company.token.toLowerCase()}`, company);
  const all = [...byKey.values()];
  writeAtomic(ws.companies, JSON.stringify({ companies: all }, null, 1));
  return all;
}
