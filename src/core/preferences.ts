import { z } from "zod";
import { LANGUAGES } from "./profile.js";

// What the person wants, from the interview. Drives the search and the documents.
export const SENIORITY = ["intern", "junior", "mid", "senior", "lead", "any"] as const;

export const PreferencesSchema = z.object({
  // national = employers/jobs in Brazil; global = remote jobs abroad open to Brazil; both.
  scope: z.enum(["national", "global", "both"]).default("both"),
  // remote = remote only; remote_or_hybrid = also hybrid in the person's city; any = also on-site there.
  workplace: z.enum(["remote", "remote_or_hybrid", "any"]).default("remote"),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().default("BR"),
  utc_offset: z.number().default(-3),
  // Key of config/areas.json (e.g. "marketing", "technology").
  area: z.string().default("other"),
  // Full titles in Portuguese and English, synonyms included ("Analista de Marketing", "Marketing Analyst").
  target_titles: z.array(z.string().min(2)).min(1),
  // Single words that make a title relevant on their own ("marketing", "CRM").
  title_keywords: z.array(z.string().min(2)).default([]),
  // Extra search terms and skills the market asks for.
  keywords: z.array(z.string()).default([]),
  seniority: z.enum(SENIORITY).default("any"),
  // Title words that rule a job out ("vendas", "estágio").
  exclude_terms: z.array(z.string()).default([]),
  avoid_companies: z.array(z.string()).default([]),
  salary_min: z
    .object({
      amount: z.number().positive(),
      currency: z.string().default("BRL"),
      period: z.enum(["month", "year"]).default("month"),
    })
    .optional(),
  // A hint for the scorer only (CLT, PJ, contractor).
  contract_types: z.array(z.string()).default([]),
  documents: z
    .object({
      main_language: z.enum(LANGUAGES).default("pt"),
      // Also produce the English resume (default: when the scope includes global jobs).
      english_resume: z.boolean().optional(),
      // Cover letters: in the posting's language, or always one language.
      letters_language: z.enum(["job", ...LANGUAGES]).default("job"),
      letters_per_search: z.number().int().min(0).max(10).default(3),
      paper: z.enum(["a4", "us-letter"]).default("a4"),
    })
    .default({ main_language: "pt", letters_language: "job", letters_per_search: 3, paper: "a4" }),
  // Recurring requirements found in sample postings, used for resume keyword coverage.
  market_keywords: z.array(z.string()).default([]),
});

export type Preferences = z.infer<typeof PreferencesSchema>;
export type PreferencesInput = z.input<typeof PreferencesSchema>;

export const wantsEnglishResume = (prefs: Preferences) =>
  prefs.documents.english_resume ?? (prefs.scope !== "national" && prefs.documents.main_language !== "en");

export const resumeLanguages = (prefs: Preferences) => {
  const languages = [prefs.documents.main_language];
  if (wantsEnglishResume(prefs) && !languages.includes("en")) languages.push("en");
  return languages;
};
