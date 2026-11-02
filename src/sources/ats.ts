import { htmlToText, type JobPosting, type Salary } from "../core/index.js";
import { getJson, HttpError, mapLimit } from "./http.js";

// Public, keyless job-board APIs of the ATS that remote-friendly companies use.
// No key, no credits: these return the employer's own posting text.

export const ATS = ["greenhouse", "lever", "ashby", "smartrecruiters", "workable", "recruitee"] as const;
export type Ats = (typeof ATS)[number];

export interface WatchedCompany {
  name: string;
  ats: Ats;
  token: string;
}

const workplaceFrom = (value: string | undefined, location: string): JobPosting["workplace"] => {
  const text = `${value ?? ""} ${location}`.toLowerCase();
  if (/remote/.test(text)) return "remote";
  if (/hybrid/.test(text)) return "hybrid";
  if (/on-?site|in[- ]office/.test(text)) return "onsite";
  return "unknown";
};

// --- Greenhouse -------------------------------------------------------------

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  company_name?: string;
  location?: { name?: string };
  content?: string;
  first_published?: string;
  updated_at?: string;
  offices?: { name?: string; location?: string | null }[];
}

export function parseGreenhouse(body: { jobs: GreenhouseJob[] }, company: WatchedCompany): JobPosting[] {
  return body.jobs.map((job) => {
    const offices = (job.offices ?? []).map((o) => o.location || o.name).filter(Boolean);
    const locationText = [job.location?.name, ...offices].filter(Boolean).join(" · ");
    return {
      id: `greenhouse:${company.token}:${job.id}`,
      source: "greenhouse",
      company: company.name,
      title: job.title.trim(),
      url: job.absolute_url,
      locationText,
      workplace: workplaceFrom(undefined, locationText),
      regions: [],
      timezones: [],
      postedAt: job.first_published ?? job.updated_at,
      tags: [],
      description: htmlToText(job.content ?? ""),
    };
  });
}

// --- Lever ------------------------------------------------------------------

interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  categories?: { location?: string; allLocations?: string[]; commitment?: string; team?: string };
  workplaceType?: string;
  country?: string;
  createdAt?: number;
  descriptionPlain?: string;
  openingPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
}

const COUNTRY_NAMES: Record<string, string> = { BR: "Brazil", US: "United States", CA: "Canada", MX: "Mexico", AR: "Argentina", CO: "Colombia" };

export function parseLever(body: LeverJob[], company: WatchedCompany): JobPosting[] {
  return body.map((job) => {
    const places = job.categories?.allLocations?.length ? job.categories.allLocations : [job.categories?.location ?? ""];
    const country = job.country ? COUNTRY_NAMES[job.country] ?? job.country : undefined;
    const locationText = [...places, country].filter(Boolean).join(" · ");
    const salary: Salary | undefined = job.salaryRange?.min || job.salaryRange?.max
      ? {
          min: job.salaryRange.min,
          max: job.salaryRange.max,
          currency: job.salaryRange.currency,
          period: /hour/.test(job.salaryRange.interval ?? "") ? "hour" : /month/.test(job.salaryRange.interval ?? "") ? "month" : "year",
        }
      : undefined;
    const sections = (job.lists ?? []).map((list) => `${list.text}\n${htmlToText(list.content)}`);
    return {
      id: `lever:${company.token}:${job.id}`,
      source: "lever",
      company: company.name,
      title: job.text.trim(),
      url: job.hostedUrl,
      locationText,
      workplace: workplaceFrom(job.workplaceType === "on-site" ? "onsite" : job.workplaceType, locationText),
      regions: [],
      timezones: [],
      postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : undefined,
      salary,
      employmentType: job.categories?.commitment,
      tags: job.categories?.team ? [job.categories.team] : [],
      description: [job.openingPlain, job.descriptionPlain, ...sections, job.additionalPlain].filter(Boolean).join("\n\n").trim(),
    };
  });
}

// --- Ashby ------------------------------------------------------------------

interface AshbyJob {
  id: string;
  title: string;
  jobUrl: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  isRemote?: boolean;
  workplaceType?: string;
  employmentType?: string;
  publishedAt?: string;
  isListed?: boolean;
  descriptionPlain?: string;
  descriptionHtml?: string;
  compensation?: { compensationTierSummary?: string | null };
}

export function parseAshby(body: { jobs: AshbyJob[] }, company: WatchedCompany): JobPosting[] {
  return body.jobs
    .filter((job) => job.isListed !== false)
    .map((job) => {
      const locations = [job.location, ...(job.secondaryLocations ?? []).map((s) => s.location)].filter(Boolean);
      const locationText = locations.join(" · ");
      const summary = job.compensation?.compensationTierSummary ?? undefined;
      return {
        id: `ashby:${company.token}:${job.id}`,
        source: "ashby",
        company: company.name,
        title: job.title.trim(),
        url: job.jobUrl,
        locationText,
        workplace: job.isRemote ? "remote" : workplaceFrom(job.workplaceType, locationText),
        regions: [],
        timezones: [],
        postedAt: job.publishedAt,
        salary: summary ? { text: summary } : undefined,
        employmentType: job.employmentType,
        tags: [],
        description: job.descriptionPlain?.trim() || htmlToText(job.descriptionHtml ?? ""),
      };
    });
}

// --- SmartRecruiters: the list has no description; details cost one request per job.

interface SmartRecruitersPosting {
  id: string;
  name: string;
  releasedDate?: string;
  company?: { name?: string };
  location?: { city?: string; country?: string; remote?: boolean; hybrid?: boolean; fullLocation?: string };
  typeOfEmployment?: { label?: string };
}

interface SmartRecruitersDetail {
  postingUrl?: string;
  jobAd?: { sections?: Record<string, { title?: string; text?: string }> };
}

export function parseSmartRecruiters(
  postings: SmartRecruitersPosting[],
  details: Map<string, SmartRecruitersDetail>,
  company: WatchedCompany,
): JobPosting[] {
  return postings.map((posting) => {
    const detail = details.get(posting.id);
    const location = posting.location;
    const locationText = (location?.fullLocation ?? [location?.city, location?.country].filter(Boolean).join(", ")).replace(/,\s*,/g, ",");
    const sections = Object.values(detail?.jobAd?.sections ?? {}).map((section) => [section.title, htmlToText(section.text ?? "")].filter(Boolean).join("\n"));
    return {
      id: `smartrecruiters:${company.token}:${posting.id}`,
      source: "smartrecruiters",
      company: company.name,
      title: posting.name.trim(),
      url: detail?.postingUrl ?? `https://jobs.smartrecruiters.com/${company.token}/${posting.id}`,
      locationText,
      workplace: location?.remote ? "remote" : location?.hybrid ? "hybrid" : workplaceFrom(undefined, locationText),
      regions: [],
      timezones: [],
      postedAt: posting.releasedDate,
      employmentType: posting.typeOfEmployment?.label,
      tags: [],
      description: sections.join("\n\n").trim(),
    };
  });
}

export async function fetchSmartRecruiters(company: WatchedCompany, wanted: (title: string) => boolean = () => true): Promise<JobPosting[]> {
  const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company.token)}/postings`;
  const list = await getJson<{ content?: SmartRecruitersPosting[] }>(`${base}?limit=100`);
  const postings = list.content ?? [];
  const details = new Map<string, SmartRecruitersDetail>();
  // Only titles that can pass the eligibility gate get a detail request.
  await mapLimit(postings.filter((p) => wanted(p.name)), 4, async (posting) => {
    details.set(posting.id, await getJson<SmartRecruitersDetail>(`${base}/${posting.id}`));
  });
  return parseSmartRecruiters(postings, details, company);
}

// --- Workable (widget API, details=true includes the description) ------------

interface WorkableBody {
  name?: string;
  jobs?: {
    shortcode: string;
    title: string;
    url?: string;
    shortlink?: string;
    city?: string;
    state?: string;
    country?: string;
    telecommuting?: boolean;
    employment_type?: string;
    published_on?: string;
    description?: string;
  }[];
}

export function parseWorkable(body: WorkableBody, company: WatchedCompany): JobPosting[] {
  return (body.jobs ?? []).map((job) => {
    const locationText = [job.telecommuting ? "Remote" : "", job.city, job.state, job.country].filter(Boolean).join(", ");
    return {
      id: `workable:${company.token}:${job.shortcode}`,
      source: "workable",
      company: company.name,
      title: job.title.trim(),
      url: job.url ?? job.shortlink ?? `https://apply.workable.com/${company.token}/j/${job.shortcode}`,
      locationText,
      workplace: job.telecommuting ? "remote" : workplaceFrom(undefined, locationText),
      regions: [],
      timezones: [],
      postedAt: job.published_on,
      employmentType: job.employment_type,
      tags: [],
      description: htmlToText(job.description ?? ""),
    };
  });
}

// --- Recruitee -----------------------------------------------------------------

interface RecruiteeBody {
  offers?: {
    id: number;
    title: string;
    company_name?: string;
    careers_url?: string;
    location?: string;
    remote?: boolean;
    hybrid?: boolean;
    published_at?: string;
    description?: string;
    requirements?: string;
    employment_type_code?: string;
  }[];
}

export function parseRecruitee(body: RecruiteeBody, company: WatchedCompany): JobPosting[] {
  return (body.offers ?? []).map((offer) => ({
    id: `recruitee:${company.token}:${offer.id}`,
    source: "recruitee",
    company: company.name,
    title: offer.title.trim(),
    url: offer.careers_url ?? `https://${company.token}.recruitee.com/o/${offer.id}`,
    locationText: [offer.remote ? "Remote" : "", offer.location].filter(Boolean).join(" · "),
    workplace: offer.remote ? "remote" : offer.hybrid ? "hybrid" : workplaceFrom(undefined, offer.location ?? ""),
    regions: [],
    timezones: [],
    postedAt: offer.published_at ? new Date(offer.published_at.replace(" UTC", "Z").replace(" ", "T")).toISOString() : undefined,
    employmentType: offer.employment_type_code,
    tags: [],
    description: [htmlToText(offer.description ?? ""), htmlToText(offer.requirements ?? "")].filter(Boolean).join("\n\n"),
  }));
}

// --- Fetch and probe ----------------------------------------------------------

const ENDPOINT: Record<Exclude<Ats, "smartrecruiters">, (token: string) => string> = {
  greenhouse: (token) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
  lever: (token) => `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`,
  ashby: (token) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`,
  workable: (token) => `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(token)}?details=true`,
  recruitee: (token) => `https://${encodeURIComponent(token)}.recruitee.com/api/offers/`,
};

export async function fetchCompany(company: WatchedCompany, wanted?: (title: string) => boolean): Promise<JobPosting[]> {
  if (company.ats === "smartrecruiters") return fetchSmartRecruiters(company, wanted);
  const body = await getJson<unknown>(ENDPOINT[company.ats](company.token));
  // Unknown tokens sometimes come back as 200 with an error object instead of a 404.
  if (company.ats === "lever") return Array.isArray(body) ? parseLever(body as LeverJob[], company) : [];
  if (company.ats === "workable") return parseWorkable(body as WorkableBody, company);
  if (company.ats === "recruitee") return parseRecruitee(body as RecruiteeBody, company);
  const jobs = (body as { jobs?: unknown }).jobs;
  if (!Array.isArray(jobs)) return [];
  return company.ats === "greenhouse"
    ? parseGreenhouse(body as { jobs: GreenhouseJob[] }, company)
    : parseAshby(body as { jobs: AshbyJob[] }, company);
}

// The employer name an API reports for a token, when it reports one. It catches
// tokens that belong to an unrelated company with a different name; it cannot
// catch a namesake ("prisma" on Recruitee is a Dutch care provider also called
// Prisma), which is why `watchlist add` also prints a sample job for a human.
async function reportedName(ats: Ats, token: string): Promise<string | undefined> {
  if (ats === "workable") return (await getJson<WorkableBody>(ENDPOINT.workable(token))).name;
  if (ats === "recruitee") return (await getJson<RecruiteeBody>(ENDPOINT.recruitee(token))).offers?.[0]?.company_name;
  if (ats === "smartrecruiters") {
    const list = await getJson<{ content?: SmartRecruitersPosting[] }>(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?limit=1`);
    return list.content?.[0]?.company?.name;
  }
  if (ats === "greenhouse") {
    const body = await getJson<{ jobs?: GreenhouseJob[] }>(ENDPOINT.greenhouse(token));
    return body.jobs?.[0]?.company_name;
  }
  return undefined;
}

export interface ProbeResult {
  ats: Ats;
  jobs: number;
  reportedName?: string;
  sample?: { title: string; url: string; location: string };
}

// Finds which ATS a company token lives on. Several answer 200 for the same
// token, so the one with the most open jobs wins.
export async function probeCompany(name: string, token: string): Promise<ProbeResult | undefined> {
  const found = await Promise.all(
    ATS.map(async (ats): Promise<ProbeResult | undefined> => {
      try {
        const jobs = await fetchCompany({ name, ats, token });
        return jobs.length > 0 ? { ats, jobs: jobs.length, sample: { title: jobs[0]!.title, url: jobs[0]!.url, location: jobs[0]!.locationText } } : undefined;
      } catch (error) {
        if (error instanceof HttpError || error instanceof TypeError || (error as Error).name === "TimeoutError") return undefined;
        throw error;
      }
    }),
  );
  let best: ProbeResult | undefined;
  for (const result of found) if (result && (!best || result.jobs > best.jobs)) best = result;
  if (best) best.reportedName = await reportedName(best.ats, token).catch(() => undefined);
  return best;
}

const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

// True when the API's company name plausibly belongs to the company we asked for.
export function sameCompany(requested: string, reported: string | undefined): boolean {
  if (!reported) return true;
  const [a, b] = [normalizeName(requested), normalizeName(reported)];
  return a.includes(b) || b.includes(a);
}
