import { annualUsd, floorUsd, isBrazilJob, titleMatch } from "./eligibility.js";
import type { JobPosting } from "./job.js";
import { escapeRegExp } from "./keywords.js";
import type { Preferences } from "./preferences.js";
import { fold, type Profile } from "./profile.js";

// A cheap 0–100 ranking that decides which eligible jobs reach the scorer agent
// first. It rewards the person's target titles, overlap with confirmed skills and
// keywords, seniority, region and recency; the agent makes the real call.

// Terms that are ordinary words in postings and say nothing about fit.
const AMBIGUOUS = new Set(["next", "agents", "rest", "go", "r", "c", "excel avançado", "comunicação", "communication", "teamwork", "office", "sales", "vendas"]);

export interface Matcher {
  name: string;
  weight: number;
  pattern: RegExp;
}

export function matchers(profile: Profile, prefs: Preferences): Matcher[] {
  const build = (name: string, terms: string[], weight: number): Matcher | undefined => {
    const usable = [...new Set(terms.map(fold))].filter((term) => term.length > 1 && !AMBIGUOUS.has(term));
    if (usable.length === 0) return undefined;
    return { name, weight, pattern: new RegExp(`(?<![\\p{L}\\d])(${usable.map(escapeRegExp).join("|")})(?![\\p{L}\\d])`, "iu") };
  };
  const fromSkills = profile.skills
    .filter((skill) => skill.confirmed)
    .map((skill) => build(skill.name, [skill.name, ...skill.aliases], skill.level === "familiar" ? 0.4 : 1));
  const known = new Set(profile.skills.flatMap((skill) => [skill.name, ...skill.aliases].map(fold)));
  const fromKeywords = prefs.keywords.filter((keyword) => !known.has(fold(keyword))).map((keyword) => build(keyword, [keyword], 0.6));
  return [...fromSkills, ...fromKeywords].filter((m): m is Matcher => m !== undefined);
}

const SENIOR = /\b(senior|sr\.?|s[eê]nior|especialista|specialist)\b/i;
const LEAD = /\b(lead|l[ií]der|head|principal|staff|coordenador|coordinator|manager|gerente)\b/i;
const MID = /\b(pleno|mid|pl\b|ii)\b/i;
const JUNIOR = /\b(junior|j[uú]nior|jr\.?|assistente|assistant|auxiliar)\b/i;
const INTERN = /\b(est[aá]gio|estagi[aá]ri[oa]|intern(ship)?|trainee|aprendiz)\b/i;

function seniorityPoints(title: string, wanted: Preferences["seniority"]): number {
  if (wanted === "any") return 6;
  const level = INTERN.test(title) ? "intern" : JUNIOR.test(title) ? "junior" : LEAD.test(title) ? "lead" : SENIOR.test(title) ? "senior" : MID.test(title) ? "mid" : undefined;
  if (!level) return 6;
  if (level === wanted) return 10;
  const order = ["intern", "junior", "mid", "senior", "lead"];
  return Math.abs(order.indexOf(level) - order.indexOf(wanted)) === 1 ? 5 : 0;
}

export interface Prescore {
  score: number;
  matched: string[];
}

export function prescore(job: JobPosting, found: Matcher[], prefs: Preferences, now = new Date()): Prescore {
  const text = fold(`${job.title}\n${job.tags.join(" ")}\n${job.description}`);
  const matched = found.filter((m) => m.pattern.test(text));
  const skillPoints = Math.min(1, matched.reduce((sum, m) => sum + m.weight, 0) / 8) * 35;

  const title = titleMatch(job.title, prefs).level;
  const titlePoints = title === "target" ? 30 : title === "keyword" ? 18 : 5;

  const where = `${job.locationText} ${job.regions.join(" ")} ${job.description.slice(0, 2000)}`;
  const regionPoints = isBrazilJob(job)
    ? 10
    : /\b(brazil|brasil)\b/i.test(where)
      ? 10
      : /\b(latam|latin america|south america|americas)\b/i.test(where)
        ? 8
        : /\b(worldwide|anywhere|global)\b/i.test(where)
          ? 6
          : 3;

  const ageDays = job.postedAt ? (now.getTime() - new Date(job.postedAt).getTime()) / 86_400_000 : Infinity;
  const recencyPoints = ageDays <= 7 ? 10 : ageDays <= 21 ? 6 : ageDays <= 45 ? 2 : 0;

  const usd = annualUsd(job.salary);
  const floor = floorUsd(prefs);
  const salaryPoints = usd !== undefined && floor && usd >= floor ? 5 : 0;

  const score = Math.min(100, Math.round(skillPoints + titlePoints + seniorityPoints(job.title, prefs.seniority) + regionPoints + recencyPoints + salaryPoints));
  return { score, matched: matched.map((m) => m.name) };
}
