import { decodeEntities, htmlToText, type JobPosting } from "../core/index.js";
import { getJson, getText, sleep } from "./http.js";

// Remote job boards with public APIs or feeds (ported from Horizon, plus Jobicy).
// Each parser is pure so it can be tested against recorded responses.

// --- Himalayas: search with a country filter returns jobs open to that country.

interface HimalayasJob {
  guid?: string;
  title: string;
  companyName: string;
  applicationLink?: string;
  locationRestrictions?: string[] | null;
  timezoneRestrictions?: number[] | null;
  minSalary?: number | null;
  maxSalary?: number | null;
  currency?: string | null;
  salaryPeriod?: string | null;
  employmentType?: string;
  seniority?: string[];
  categories?: string[];
  pubDate?: number;
  description?: string;
}

export function parseHimalayas(body: { jobs?: HimalayasJob[] }): JobPosting[] {
  return (body.jobs ?? []).map((job) => {
    const url = job.guid?.startsWith("http") ? job.guid : job.applicationLink ?? "";
    const period = /hour/i.test(job.salaryPeriod ?? "") ? "hour" : /month/i.test(job.salaryPeriod ?? "") ? "month" : "year";
    return {
      id: `himalayas:${url || `${job.companyName}:${job.title}`}`,
      source: "himalayas",
      company: job.companyName,
      title: job.title.trim(),
      url,
      locationText: (job.locationRestrictions ?? []).length ? `Remote (${(job.locationRestrictions ?? []).join(", ")})` : "Remote",
      workplace: "remote",
      regions: job.locationRestrictions ?? [],
      timezones: job.timezoneRestrictions ?? [],
      postedAt: job.pubDate ? new Date(job.pubDate * 1000).toISOString() : undefined,
      salary: job.minSalary || job.maxSalary ? { min: job.minSalary ?? undefined, max: job.maxSalary ?? undefined, currency: job.currency ?? undefined, period } : undefined,
      employmentType: job.employmentType,
      tags: [...(job.seniority ?? []), ...(job.categories ?? [])],
      description: htmlToText(job.description ?? ""),
    };
  });
}

// Search pages hold 20 jobs and are numbered from 1 (`?page=2`).
export async function fetchHimalayas(queries: string[], country: string | undefined, pages: number): Promise<JobPosting[]> {
  const jobs: JobPosting[] = [];
  for (const query of queries) {
    for (let page = 1; page <= pages; page++) {
      const params = new URLSearchParams({ q: query });
      if (page > 1) params.set("page", String(page));
      if (country) params.set("country", country);
      const batch = parseHimalayas(await getJson(`https://himalayas.app/jobs/api/search?${params}`));
      jobs.push(...batch);
      await sleep(400);
      if (batch.length < 20) break;
    }
  }
  return jobs;
}

// --- Jobicy: remote jobs filtered by region (geo) and industry.

interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName: string;
  jobIndustry?: string[];
  jobType?: string[];
  jobGeo?: string;
  jobLevel?: string;
  jobDescription?: string;
  jobExcerpt?: string;
  pubDate?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
}

export function parseJobicy(body: { jobs?: JobicyJob[] }): JobPosting[] {
  return (body.jobs ?? []).map((job) => {
    const regions = (job.jobGeo ?? "").split(",").map((region) => region.trim()).filter(Boolean);
    const period = /hour/i.test(job.salaryPeriod ?? "") ? "hour" : /month/i.test(job.salaryPeriod ?? "") ? "month" : "year";
    return {
      id: `jobicy:${job.id}`,
      source: "jobicy",
      company: decodeEntities(job.companyName ?? "").trim(),
      title: decodeEntities(job.jobTitle).trim(),
      url: job.url,
      locationText: regions.length ? `Remote (${regions.join(", ")})` : "Remote",
      workplace: "remote",
      regions: regions.map((region) => (/anywhere/i.test(region) ? "Worldwide" : region)),
      timezones: [],
      postedAt: job.pubDate ? new Date(job.pubDate).toISOString() : undefined,
      salary: job.salaryMin || job.salaryMax ? { min: job.salaryMin, max: job.salaryMax, currency: job.salaryCurrency, period } : undefined,
      employmentType: job.jobType?.join(", "),
      tags: [...(job.jobIndustry ?? []), ...(job.jobLevel ? [job.jobLevel] : [])].map((tag) => decodeEntities(tag)),
      description: htmlToText(job.jobDescription ?? job.jobExcerpt ?? ""),
    };
  });
}

export async function fetchJobicy(geos: string[], industries: string[], tag?: string): Promise<JobPosting[]> {
  const jobs: JobPosting[] = [];
  const combos = industries.length > 0 ? geos.flatMap((geo) => industries.map((industry) => ({ geo, industry }))) : geos.map((geo) => ({ geo, industry: "" }));
  for (const { geo, industry } of combos) {
    const params = new URLSearchParams({ count: "50", geo });
    if (industry) params.set("industry", industry);
    if (tag) params.set("tag", tag);
    jobs.push(...parseJobicy(await getJson(`https://jobicy.com/api/v2/remote-jobs?${params}`)));
    await sleep(500);
  }
  return jobs;
}

// --- Remote OK: the first array element is the API's legal notice.

interface RemoteOkJob {
  id?: string;
  position?: string;
  company?: string;
  url?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  date?: string;
  tags?: string[];
  description?: string;
}

export function parseRemoteOk(body: RemoteOkJob[]): JobPosting[] {
  return body
    .filter((job) => job.id && job.position)
    .map((job) => ({
      id: `remoteok:${job.id}`,
      source: "remoteok",
      company: (job.company ?? "").trim(),
      title: job.position!.trim(),
      url: job.url ?? "",
      locationText: job.location?.trim() || "Remote",
      workplace: "remote",
      regions: [],
      timezones: [],
      postedAt: job.date,
      salary: job.salary_min || job.salary_max ? { min: job.salary_min || undefined, max: job.salary_max || undefined, currency: "USD", period: "year" } : undefined,
      tags: job.tags ?? [],
      description: htmlToText(job.description ?? ""),
    }));
}

export async function fetchRemoteOk(tags: string[]): Promise<JobPosting[]> {
  const jobs: JobPosting[] = [];
  for (const tag of tags) {
    jobs.push(...parseRemoteOk(await getJson(`https://remoteok.com/api?tag=${encodeURIComponent(tag)}`)));
    await sleep(1_000);
  }
  return jobs;
}

// --- We Work Remotely: RSS per category. Titles are "Company: Role".

const tag = (item: string, name: string) => decodeEntities(item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? "");

export function parseWeWorkRemotely(xml: string): JobPosting[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item = ""]) => {
    const fullTitle = tag(item, "title");
    const split = fullTitle.indexOf(": ");
    const region = tag(item, "region");
    const country = tag(item, "country").replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").trim();
    const link = tag(item, "link") || tag(item, "guid");
    return {
      id: `weworkremotely:${link}`,
      source: "weworkremotely",
      company: split > 0 ? fullTitle.slice(0, split) : "",
      title: split > 0 ? fullTitle.slice(split + 2) : fullTitle,
      url: link,
      locationText: [region, country].filter(Boolean).join(" · "),
      workplace: "remote",
      regions: region && !/anywhere/i.test(region) ? [region.replace(/\s+only$/i, "")] : region ? ["Worldwide"] : [],
      timezones: [],
      postedAt: tag(item, "pubDate") ? new Date(tag(item, "pubDate")).toISOString() : undefined,
      employmentType: tag(item, "type") || undefined,
      tags: [tag(item, "category")].filter(Boolean),
      description: htmlToText(tag(item, "description")),
    } satisfies JobPosting;
  });
}

export async function fetchWeWorkRemotely(categories: string[]): Promise<JobPosting[]> {
  const jobs: JobPosting[] = [];
  for (const category of categories) {
    jobs.push(...parseWeWorkRemotely(await getText(`https://weworkremotely.com/categories/${category}.rss`)));
    await sleep(500);
  }
  return jobs;
}

// --- Remotive: one request per category (the API asks for few calls a day).

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  candidate_required_location?: string;
  publication_date?: string;
  salary?: string;
  job_type?: string;
  tags?: string[];
  description?: string;
}

export function parseRemotive(body: { jobs?: RemotiveJob[] }): JobPosting[] {
  return (body.jobs ?? []).map((job) => {
    const where = job.candidate_required_location?.trim() ?? "";
    return {
      id: `remotive:${job.id}`,
      source: "remotive",
      company: job.company_name.trim(),
      title: job.title.trim(),
      url: job.url,
      locationText: where || "Remote",
      workplace: "remote",
      regions: where ? where.split(/\s*,\s*/).filter(Boolean) : [],
      timezones: [],
      postedAt: job.publication_date,
      salary: job.salary ? { text: job.salary } : undefined,
      employmentType: job.job_type,
      tags: job.tags ?? [],
      description: htmlToText(job.description ?? ""),
    };
  });
}

export async function fetchRemotive(categories: string[]): Promise<JobPosting[]> {
  const jobs: JobPosting[] = [];
  for (const category of categories) {
    jobs.push(...parseRemotive(await getJson(`https://remotive.com/api/remote-jobs?category=${encodeURIComponent(category)}`)));
    await sleep(500);
  }
  return jobs;
}
