import areasConfig from "../../config/areas.json" with { type: "json" };
import seedConfig from "../../config/companies-tech.json" with { type: "json" };
import { titleMatch, type JobPosting, type Preferences } from "../core/index.js";
import { fetchCompany, type Ats, type WatchedCompany } from "./ats.js";
import { fetchHimalayas, fetchJobicy, fetchRemoteOk, fetchRemotive, fetchWeWorkRemotely } from "./boards.js";
import { fetchGupy } from "./gupy.js";
import { mapLimit } from "./http.js";

export * from "./ats.js";
export * from "./boards.js";
export * from "./gupy.js";
export * from "./http.js";
export * from "./urls.js";

export interface Area {
  label: string;
  wwr: string[];
  remotive: string[];
  jobicy: string[];
  remoteok?: boolean;
  seed_companies?: boolean;
}

export const AREAS: Record<string, Area> = areasConfig.areas;
export const SEED_COMPANIES = seedConfig.companies as WatchedCompany[];

export const areaOf = (key: string): Area => AREAS[key] ?? AREAS.other!;

export interface SourceRun {
  source: string;
  jobs: JobPosting[];
  error?: string;
  ms: number;
}

export interface SearchPlanStep {
  source: string;
  run: () => Promise<JobPosting[]>;
}

// Single lowercase words make usable Remote OK tags ("marketing", "react").
const tagOf = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "-");

// Which sources to query and with what terms. Only search terms leave the computer.
export function planSearch(prefs: Preferences, companies: WatchedCompany[], options: { sample?: boolean } = {}): SearchPlanStep[] {
  const area = areaOf(prefs.area);
  const national = prefs.scope !== "global";
  const global = prefs.scope !== "national";
  const titles = [...new Set(prefs.target_titles.map((title) => title.trim()))].slice(0, options.sample ? 2 : 5);
  const wanted = (title: string) => titleMatch(title, prefs).level !== "none";
  const steps: SearchPlanStep[] = [];

  if (national) {
    const remoteOnly = prefs.workplace === "remote";
    steps.push({ source: "gupy", run: () => fetchGupy(titles, remoteOnly, options.sample ? 1 : remoteOnly ? 2 : 3) });
  }
  if (global) {
    steps.push({ source: "himalayas", run: () => fetchHimalayas(titles, prefs.country, options.sample ? 1 : 2) });
    steps.push({ source: "jobicy", run: () => fetchJobicy(options.sample ? ["brazil"] : ["brazil", "latam", "anywhere"], area.jobicy.slice(0, 2)) });
    if (!options.sample) {
      steps.push({ source: "weworkremotely", run: () => fetchWeWorkRemotely(area.wwr.slice(0, 3)) });
      steps.push({ source: "remotive", run: () => fetchRemotive(area.remotive.slice(0, 2)) });
      if (area.remoteok) {
        const tags = [...new Set(prefs.title_keywords.filter((k) => !/\s/.test(k.trim())).map(tagOf))].slice(0, 3);
        if (tags.length > 0) steps.push({ source: "remoteok", run: () => fetchRemoteOk(tags) });
      }
    }
  }
  if (!options.sample) {
    const list = [...companies, ...(area.seed_companies && global ? SEED_COMPANIES : [])];
    const unique = [...new Map(list.map((c) => [`${c.ats}:${c.token.toLowerCase()}`, c])).values()];
    if (unique.length > 0) {
      steps.push({
        source: "companies",
        run: async () => {
          const results = await mapLimit(unique, 4, (company) => fetchCompany(company, wanted).catch(() => [] as JobPosting[]));
          return results.flat();
        },
      });
    }
  }
  return steps;
}

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string) =>
  Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}: timed out after ${Math.round(ms / 1000)}s`)), ms))]);

// Runs every step in parallel; a failing source never fails the search.
export async function runSearch(steps: SearchPlanStep[], timeoutMs = 90_000): Promise<SourceRun[]> {
  return Promise.all(
    steps.map(async (step): Promise<SourceRun> => {
      const started = Date.now();
      try {
        const jobs = await withTimeout(step.run(), timeoutMs, step.source);
        return { source: step.source, jobs, ms: Date.now() - started };
      } catch (error) {
        return { source: step.source, jobs: [], error: (error as Error).message, ms: Date.now() - started };
      }
    }),
  );
}

export async function fetchCompanies(links: { ats: Ats; token: string; name?: string }[], prefs: Preferences): Promise<{ company: WatchedCompany; jobs: JobPosting[]; error?: string }[]> {
  const wanted = (title: string) => titleMatch(title, prefs).level !== "none";
  return mapLimit(links, 4, async (link) => {
    const company = { name: link.name ?? link.token, ats: link.ats, token: link.token };
    try {
      const jobs = await fetchCompany(company, wanted);
      // Boards report the employer's name better than a token does.
      const name = link.name ?? jobs.find((job) => job.company && job.company !== link.token)?.company ?? link.token;
      return { company: { ...company, name }, jobs: jobs.map((job) => ({ ...job, company: link.name ?? job.company })) };
    } catch (error) {
      return { company, jobs: [], error: (error as Error).message };
    }
  });
}
