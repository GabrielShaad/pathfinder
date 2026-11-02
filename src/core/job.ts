import { z } from "zod";

// One job posting, normalized from any source (ported from Horizon). Descriptions
// are plain text, verbatim from the source apart from HTML stripping.

export const SOURCES = [
  "greenhouse", "lever", "ashby", "smartrecruiters", "workable", "recruitee",
  "gupy", "himalayas", "jobicy", "remoteok", "weworkremotely", "remotive",
] as const;
export type SourceName = (typeof SOURCES)[number];

export const SOURCE_LABEL: Record<SourceName, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
  recruitee: "Recruitee",
  gupy: "Gupy",
  himalayas: "Himalayas",
  jobicy: "Jobicy",
  remoteok: "Remote OK",
  weworkremotely: "We Work Remotely",
  remotive: "Remotive",
};

// Lower wins when the same job comes from several sources: ATS APIs carry the
// employer's own text, boards often truncate or rewrite it.
export const SOURCE_PRIORITY: Record<SourceName, number> = {
  greenhouse: 0,
  lever: 0,
  ashby: 0,
  smartrecruiters: 0,
  workable: 0,
  recruitee: 0,
  gupy: 0,
  himalayas: 1,
  jobicy: 1,
  remoteok: 2,
  weworkremotely: 2,
  remotive: 3,
};

export const SalarySchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  currency: z.string().optional(),
  period: z.enum(["year", "month", "hour"]).optional(),
  text: z.string().optional(),
});

export const JobPostingSchema = z.object({
  id: z.string(), // `${source}:${externalId}`
  source: z.enum(SOURCES),
  company: z.string(),
  title: z.string(),
  url: z.string(),
  locationText: z.string().default(""),
  workplace: z.enum(["remote", "hybrid", "onsite", "unknown"]).default("unknown"),
  // Countries or regions the source says the job is open to (empty = not stated).
  regions: z.array(z.string()).default([]),
  // UTC offsets the source says the job is open to (empty = not stated).
  timezones: z.array(z.number()).default([]),
  // True when the source only lists jobs in Brazil (Gupy).
  brazil: z.boolean().optional(),
  postedAt: z.string().optional(),
  salary: SalarySchema.optional(),
  employmentType: z.string().optional(),
  tags: z.array(z.string()).default([]),
  description: z.string().default(""),
});

export type JobPosting = z.infer<typeof JobPostingSchema>;
export type Salary = z.infer<typeof SalarySchema>;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", hellip: "…", bull: "•", middot: "·", eacute: "é", aacute: "á", iacute: "í", oacute: "ó",
  uacute: "ú", atilde: "ã", otilde: "õ", ccedil: "ç", ecirc: "ê", acirc: "â", ocirc: "ô", agrave: "à",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function htmlToText(html: string): string {
  // Greenhouse double-escapes its HTML, so decode until there are tags to strip.
  let source = html;
  for (let i = 0; i < 2 && /&lt;\/?[a-z]/i.test(source); i++) source = decodeEntities(source);
  return decodeEntities(
    source
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|section)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(inc|llc|ltd|ltda|gmbh|s\.?a|corp|co)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// "Grupo Henry Schein Brasil" on Gupy is "Henry Schein Brasil" on a board.
const COMPANY_NOISE = /\b(grupo|group|holding|brasil|brazil|do|da|de|the|sa|s a|ltda|me|eireli|technologies|tecnologia)\b/g;
const normalizeCompany = (value: string) => {
  const key = normalizeKey(value);
  return key.replace(COMPANY_NOISE, " ").replace(/\s+/g, " ").trim() || key;
};

// Same company + same title = same job, whichever board it came from.
export function dedupeKey(job: Pick<JobPosting, "company" | "title">): string {
  return `${normalizeCompany(job.company)}|${normalizeKey(job.title)}`;
}

// Keeps the best copy of each job (by source priority, then the longest description).
export function dedupe(jobs: JobPosting[]): JobPosting[] {
  const best = new Map<string, JobPosting>();
  const seenIds = new Set<string>();
  for (const job of jobs) {
    if (seenIds.has(job.id)) continue;
    seenIds.add(job.id);
    const key = dedupeKey(job);
    const current = best.get(key);
    const better =
      !current ||
      SOURCE_PRIORITY[job.source] < SOURCE_PRIORITY[current.source] ||
      (SOURCE_PRIORITY[job.source] === SOURCE_PRIORITY[current.source] && job.description.length > current.description.length);
    if (better) best.set(key, job);
  }
  return [...best.values()];
}
