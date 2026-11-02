import { htmlToText, type JobPosting } from "../core/index.js";
import { getText, sleep } from "./http.js";

// Gupy is where most Brazilian employers post. It has no official public API: the
// candidate portal (portal.gupy.io) renders its search server-side and embeds the
// results as JSON in __NEXT_DATA__ (12 jobs per page, `&page=N`). This reads that
// JSON with a light touch: a few pages per search, and any change in the page
// makes this source return nothing instead of breaking the search.

interface GupyJob {
  id: number;
  name: string;
  description?: string;
  careerPageName?: string;
  careerPageUrl?: string;
  jobUrl?: string;
  city?: string;
  state?: string;
  workplaceType?: string;
  type?: string;
  publishedDate?: string;
  applicationDeadline?: string;
}

const TYPES: Record<string, string> = {
  vacancy_type_effective: "CLT",
  vacancy_legal_entity: "PJ",
  vacancy_type_internship: "Estágio",
  vacancy_type_temporary: "Temporário",
  vacancy_type_talent_pool: "talent_pool",
  vacancy_type_apprentice: "Jovem Aprendiz",
  vacancy_type_trainee: "Trainee",
  vacancy_type_freelancer: "Freelancer",
  vacancy_type_associate: "Associado",
  vacancy_type_autonomous: "Autônomo",
  vacancy_type_lecturer: "Docente",
  vacancy_type_summer: "Temporário",
};

// Career page names often carry a slogan ("Acme - venha fazer parte!").
const companyName = (job: GupyJob) => (job.careerPageName ?? "").split(/\s[-–|]\s/)[0]!.trim() || "Empresa (Gupy)";

export function parseGupyPage(html: string): { jobs: JobPosting[]; total: number } {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return { jobs: [], total: 0 };
  // Raw control characters inside job descriptions break JSON.parse.
  const data = JSON.parse(match[1]!.replace(/[\u0000-\u001f]/g, " ")) as {
    props?: { pageProps?: { initialJobList?: { data?: GupyJob[]; pagination?: { total?: number } } } };
  };
  const list = data.props?.pageProps?.initialJobList;
  const jobs = (list?.data ?? []).map((job): JobPosting => {
    const place = [job.city, job.state].filter(Boolean).join(", ");
    const workplace = job.workplaceType === "remote" ? "remote" : job.workplaceType === "hybrid" ? "hybrid" : job.workplaceType === "on-site" ? "onsite" : "unknown";
    const label = workplace === "remote" ? "Remoto" : workplace === "hybrid" ? "Híbrido" : workplace === "onsite" ? "Presencial" : "";
    return {
      id: `gupy:${job.id}`,
      source: "gupy",
      company: companyName(job),
      title: job.name.trim(),
      url: job.jobUrl ?? "",
      locationText: [label, place || "Brasil"].filter(Boolean).join(" · "),
      workplace,
      regions: ["Brazil"],
      timezones: [],
      brazil: true,
      postedAt: job.publishedDate,
      employmentType: job.type ? TYPES[job.type] ?? job.type : undefined,
      tags: [],
      description: htmlToText(job.description ?? ""),
    };
  });
  return { jobs, total: list?.pagination?.total ?? jobs.length };
}

export async function fetchGupy(terms: string[], remoteOnly: boolean, pages: number): Promise<JobPosting[]> {
  const jobs: JobPosting[] = [];
  for (const term of terms) {
    for (let page = 1; page <= pages; page++) {
      let path = `term=${encodeURIComponent(term)}`;
      if (remoteOnly) path += "&workplaceTypes[]=remote";
      if (page > 1) path += `&page=${page}`;
      const { jobs: batch, total } = parseGupyPage(await getText(`https://portal.gupy.io/job-search/${path}`));
      jobs.push(...batch);
      await sleep(700);
      if (batch.length < 12 || page * 12 >= total) break;
    }
  }
  return jobs;
}
