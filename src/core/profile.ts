import { z } from "zod";

// The profile is the single source of truth (ported from Horizon, ADR-0003 there).
// The resume may only select and rephrase its facts; anything with
// `confirmed: false` can never reach a generated document.

export const LANGUAGES = ["pt", "en", "es"] as const;
export type Lang = (typeof LANGUAGES)[number];

const yearMonth = z.string().regex(/^\d{4}-\d{2}$/, "expected YYYY-MM");
const slug = z.string().regex(/^[a-z0-9-]+$/, "lowercase letters, digits and dashes only");

// Translations of display fields (not facts) per language, e.g. { en: { title: "Marketing Analyst" } }.
// They let the English resume show translated titles without inventing anything.
const I18n = z.record(z.string(), z.record(z.string(), z.string())).default({});

export const FactSchema = z.object({
  id: slug,
  text: z.string().min(1),
  skills: z.array(z.string()).default([]),
  metrics: z.array(z.string()).default([]),
  // achievement = the outcome happened and can be stated as a result;
  // responsibility = scope or intent only, never rephrased as an outcome.
  kind: z.enum(["achievement", "responsibility"]).default("responsibility"),
  // Where the fact came from: the person's own resume or an interview answer.
  source: z.enum(["resume", "interview"]).default("resume"),
  confirmed: z.boolean().default(true),
  note: z.string().optional(),
});

export const RoleSchema = z.object({
  id: slug,
  company: z.string().min(1),
  company_context: z.string().optional(),
  client: z.string().optional(),
  title: z.string().min(1),
  employment_type: z.enum(["full-time", "contract", "part-time", "freelance", "internship"]).default("full-time"),
  location: z.string().optional(),
  start: yearMonth,
  end: yearMonth.nullable(),
  // Earlier roles are rendered as one compact line.
  earlier: z.boolean().default(false),
  facts: z.array(FactSchema).default([]),
  i18n: I18n,
});

export const ProjectSchema = z.object({
  id: slug,
  name: z.string().min(1),
  role: z.string().optional(),
  url: z.string().url().optional(),
  period: z.string().optional(),
  facts: z.array(FactSchema).min(1),
  i18n: I18n,
});

export const EducationSchema = z.object({
  id: slug,
  institution: z.string().min(1),
  degree: z.string().min(1),
  field: z.string().optional(),
  start: yearMonth.optional(),
  end: yearMonth.nullable().optional(),
  // detail is printed on the resume; note is for the person only.
  detail: z.string().optional(),
  note: z.string().optional(),
  confirmed: z.boolean().default(true),
  i18n: I18n,
});

export const SkillSchema = z.object({
  name: z.string().min(1),
  // Other spellings and translations ("Gestão de projetos" ↔ "Project management").
  aliases: z.array(z.string()).default([]),
  category: z.string().default("Skills"),
  // familiar = real but not interview-deep: listed only in the working-knowledge group.
  level: z.enum(["proficient", "familiar"]).default("proficient"),
  confirmed: z.boolean().default(true),
  note: z.string().optional(),
});

export const LanguageSkillSchema = z.object({
  name: z.string().min(1),
  // basic | intermediate | advanced | fluent | native, or free text.
  level: z.string().min(1),
  confirmed: z.boolean().default(true),
  i18n: I18n,
});

export const ProfileSchema = z.object({
  basics: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().default(""),
    location: z.string().default(""),
    availability: z.string().optional(),
    links: z.array(z.object({ label: z.string(), url: z.string().url() })).default([]),
    // One headline per language the resume is produced in.
    headlines: z.record(z.string(), z.string()).default({}),
    years_experience: z.number().int().nonnegative().optional(),
    // Language the facts are written in.
    language: z.enum(LANGUAGES).default("pt"),
    i18n: I18n,
  }),
  // Facts about the whole career (summary material), not one role.
  career_facts: z.array(FactSchema).default([]),
  skills: z.array(SkillSchema).default([]),
  roles: z.array(RoleSchema).default([]),
  projects: z.array(ProjectSchema).default([]),
  education: z.array(EducationSchema).default([]),
  languages: z.array(LanguageSkillSchema).default([]),
  certifications: z
    .array(z.object({ name: z.string(), issuer: z.string().default(""), year: z.string().optional(), i18n: I18n }))
    .default([]),
});

export type Fact = z.infer<typeof FactSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Education = z.infer<typeof EducationSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileInput = z.input<typeof ProfileSchema>;

export interface FactRef {
  fact: Fact;
  owner: { kind: "career" } | { kind: "role"; id: string } | { kind: "project"; id: string };
}

export function indexFacts(profile: Profile): Map<string, FactRef> {
  const index = new Map<string, FactRef>();
  const add = (fact: Fact, owner: FactRef["owner"]) => {
    if (index.has(fact.id)) throw new Error(`Duplicate fact id "${fact.id}" in profile`);
    index.set(fact.id, { fact, owner });
  };
  for (const fact of profile.career_facts) add(fact, { kind: "career" });
  for (const role of profile.roles) for (const fact of role.facts) add(fact, { kind: "role", id: role.id });
  for (const project of profile.projects) for (const fact of project.facts) add(fact, { kind: "project", id: project.id });
  return index;
}

export const fold = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

export function findSkill(profile: Profile, name: string): Skill | undefined {
  const wanted = fold(name);
  return profile.skills.find((skill) => fold(skill.name) === wanted || skill.aliases.some((alias) => fold(alias) === wanted));
}

// A translated display field, falling back to the original.
export const translated = (i18n: Record<string, Record<string, string>>, lang: string, key: string, fallback: string) =>
  i18n[lang]?.[key]?.trim() || fallback;
