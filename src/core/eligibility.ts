import type { JobPosting, Salary } from "./job.js";
import { detectLanguage } from "./language.js";
import type { Preferences } from "./preferences.js";
import { fold, type Profile } from "./profile.js";

// Hard filters that need no judgment, driven by the person's preferences (Horizon's
// version was hard-coded to one engineer). Anything they cannot decide is "unclear"
// and left to the scorer agent; anything they reject never costs a token.
// Reasons are in Portuguese: they reach the person through the job list.

export interface Eligibility {
  verdict: "eligible" | "unclear" | "ineligible";
  track: "national" | "global" | "none";
  reasons: string[];
  title: "target" | "keyword" | "none";
}

// --- Titles -----------------------------------------------------------------

const STOP = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "of", "the", "and", "in", "for", "a", "o", "y", "en", "la", "el", "&", "-", "/"]);
const LEVEL_WORDS = new Set(["senior", "sr", "pleno", "pl", "junior", "jr", "mid", "i", "ii", "iii", "iv", "v"]);

const words = (text: string) => fold(text).split(/[^\p{L}\d+#]+/u).filter(Boolean);
const stem = (word: string) => (word.length > 5 ? word.slice(0, word.length - 2) : word);
const hasWord = (title: string[], word: string) => title.some((w) => w === word || (word.length > 3 && w.startsWith(stem(word))));

export function titleMatch(title: string, prefs: Pick<Preferences, "target_titles" | "title_keywords">): { level: Eligibility["title"]; matched?: string } {
  const titleWords = words(title);
  for (const target of prefs.target_titles) {
    const significant = words(target).filter((w) => !STOP.has(w) && !LEVEL_WORDS.has(w));
    if (significant.length > 0 && significant.every((w) => hasWord(titleWords, w))) return { level: "target", matched: target };
  }
  for (const keyword of prefs.title_keywords) {
    const parts = words(keyword).filter((w) => !STOP.has(w));
    if (parts.length > 0 && parts.every((w) => hasWord(titleWords, w))) return { level: "keyword", matched: keyword };
  }
  return { level: "none" };
}

const BELOW_SENIOR = ["estagio", "estagiario", "estagiaria", "intern", "internship", "trainee", "aprendiz", "junior", "jr"];
const ABOVE_JUNIOR = ["senior", "sr", "lead", "lider", "principal", "staff", "head", "diretor", "diretora", "director", "especialista"];

function seniorityExclusions(prefs: Preferences): string[] {
  switch (prefs.seniority) {
    case "senior":
    case "lead":
      return BELOW_SENIOR;
    case "mid":
      return ["estagio", "estagiario", "estagiaria", "intern", "internship", "trainee", "aprendiz"];
    case "junior":
      return ABOVE_JUNIOR;
    case "intern":
      return [...ABOVE_JUNIOR, "pleno"];
    default:
      return [];
  }
}

function excludedBy(title: string, prefs: Preferences): string | undefined {
  const titleWords = words(title);
  const inTargets = new Set(prefs.target_titles.flatMap(words));
  const terms = [...seniorityExclusions(prefs), ...prefs.exclude_terms.map(fold)];
  return terms.find((term) => {
    const parts = words(term);
    if (parts.length === 0 || parts.every((p) => inTargets.has(p))) return false;
    return parts.every((p) => titleWords.includes(p));
  });
}

// --- Languages ---------------------------------------------------------------

const LANGUAGE_NAMES: Record<string, RegExp> = {
  english: /\b(english|ingl[eê]s|ingles)\b/i,
  spanish: /\b(spanish|espanhol|español|espanol)\b/i,
  german: /\b(german|alem[aã]o|deutsch)\b/i,
  french: /\b(french|franc[eê]s|français)\b/i,
  italian: /\b(italian|italiano)\b/i,
  dutch: /\b(dutch|holand[eê]s)\b/i,
  japanese: /\b(japanese|japon[eê]s)\b/i,
  mandarin: /\b(mandarin|chinese|mandarim|chin[eê]s)\b/i,
  portuguese: /\b(portuguese|portugu[eê]s)\b/i,
};

const LEVEL_RANK: [RegExp, number][] = [
  [/nativ|native|materna/i, 5],
  [/fluen|c2|bilingu/i, 4],
  [/avan[cç]|advanced|c1|proficien/i, 3],
  [/intermedi|b1|b2|conversa/i, 2],
  [/b[aá]sic|basic|a1|a2|elementar|iniciante|beginner/i, 1],
];

export const levelRank = (level: string) => LEVEL_RANK.find(([pattern]) => pattern.test(level))?.[1] ?? 0;

function spokenLevel(profile: Pick<Profile, "languages" | "basics">, language: string): number {
  if (language === "portuguese" && profile.basics.language === "pt") return 5;
  const entry = profile.languages.find((l) => LANGUAGE_NAMES[language]?.test(l.name) || fold(l.name) === language);
  return entry ? levelRank(entry.level) : 0;
}

const REQUIRES_LEVEL =
  /(fluent|fluency|fluente|advanced|avan[cç]ad[oa]|native|nativ[oa]|proficient|proficiency|business[- ]level|professional working|excellent|strong|c1|c2)[^.\n]{0,30}?\b(english|ingl[eê]s|spanish|espanhol|german|alem[aã]o|french|franc[eê]s|italian|italiano|dutch|japanese|mandarin)\b|\b(english|ingl[eê]s|spanish|espanhol|german|alem[aã]o|french|franc[eê]s|italian|italiano|dutch|japanese|mandarin)\b[^.\n]{0,25}?\b(required|mandatory|is a must|essential|obrigat[oó]rio|fluente|fluent|fluency|avan[cç]ad[oa]|advanced|c1|c2)/i;

function requiredLanguage(description: string): { language: string; quote: string } | undefined {
  const match = description.match(REQUIRES_LEVEL);
  if (!match) return undefined;
  const quote = match[0];
  const language = Object.entries(LANGUAGE_NAMES).find(([, pattern]) => pattern.test(quote))?.[0];
  return language ? { language, quote: quote.trim() } : undefined;
}

const LANGUAGE_PT: Record<string, string> = {
  english: "inglês", spanish: "espanhol", german: "alemão", french: "francês", italian: "italiano",
  dutch: "holandês", japanese: "japonês", mandarin: "mandarim", portuguese: "português",
};

// --- Salary ------------------------------------------------------------------

// Rough rates, only to compare against the floor with a 25% margin. Not for display.
const FX_TO_USD: Record<string, number> = { USD: 1, EUR: 1.08, GBP: 1.27, CAD: 0.73, AUD: 0.66, NZD: 0.6, CHF: 1.12, BRL: 0.18, MXN: 0.055, ARS: 0.001, COP: 0.00025, CLP: 0.001 };

export function annualUsd(salary: Pick<Salary, "min" | "max" | "currency" | "period"> | undefined): number | undefined {
  if (!salary?.max && !salary?.min) return undefined;
  const value = salary.max ?? salary.min!;
  const rate = FX_TO_USD[(salary.currency ?? "USD").toUpperCase()];
  if (!rate) return undefined;
  const yearly = salary.period === "hour" ? value * 2000 : salary.period === "month" ? value * 12 : value;
  return yearly * rate;
}

export const floorUsd = (prefs: Preferences) =>
  prefs.salary_min ? annualUsd({ max: prefs.salary_min.amount, currency: prefs.salary_min.currency, period: prefs.salary_min.period }) : undefined;

// --- Location ----------------------------------------------------------------

const BRAZIL_PLACE =
  /\b(brazil|brasil)\b|s[aã]o paulo|rio de janeiro|belo horizonte|curitiba|florian[oó]polis|porto alegre|recife|bras[ií]lia|campinas|fortaleza|(?<!el )salvador|goi[aâ]nia|manaus|bel[eé]m|vit[oó]ria|joinville|ribeir[aã]o preto|sorocaba|santos|uberl[aâ]ndia|natal|jo[aã]o pessoa|macei[oó]|teresina|aracaju|cuiab[aá]|campo grande|londrina|maring[aá]|blumenau/i;
const UF_SUFFIX = /(,|-|\/)\s?(SP|RJ|MG|RS|PR|SC|BA|PE|CE|DF|GO|ES|PA|AM|MA|PB|RN|AL|PI|MT|MS|SE|RO|TO|AC|AP|RR)\b/;
const OPEN_TO_BRAZIL =
  /\b(brazil|brasil|latam|latin america|am[eé]rica latina|south america|the americas|americas|worldwide|anywhere|work from anywhere|global remote)\b/i;
const WEAKLY_OPEN = /\b(global(ly)?|international(ly)?|distributed)\b/i;
const RESTRICTED_REMOTE = [
  /\b(us|u\.s\.|usa|united states|north america|canada|uk|united kingdom|europe|eu|emea|apac|india|germany|spain|poland|portugal|australia|philippines|mexico)[- ]?(only|based|residents?|citizens?)\b/i,
  /must (be|reside|live|be located|be based)[^.]{0,40}\b(in|within) (the )?(us|u\.s\.|usa|united states|uk|united kingdom|europe|eu|canada|germany)\b/i,
  /(authori[sz]ed|eligible|permitted) to work in the (us|u\.s\.|usa|united states|uk|united kingdom|eu|european union)\b(?![^.]{0,30}\b(or|and) (latam|latin america|brazil))/i,
  /\bremote[,:\s-]*\(?(us|usa|united states|u\.s\.|canada|uk|united kingdom|emea|europe|eu|apac|india)\)?(?![a-z])/i,
  /\b(us|usa|u\.s\.|uk|eu|emea|canada)[- ]remote\b/i,
];
const TITLE_PLACE = /\bremote\s*[@(,:\-–—]\s*([A-Za-z][A-Za-z .]{1,30}?)\s*(?:\)|$|[,|/-])/i;
const REMOTE_WORDS = /\b(remote|remoto|remota|home ?office|teletrabalho|anywhere)\b/i;

// Located in Brazil, not merely open to it: a remote job listing Brazil among 40
// countries is an international job.
export function isBrazilJob(job: JobPosting): boolean {
  if (job.brazil) return true;
  if (job.regions.length > 0) return job.regions.every((region) => BRAZIL_PLACE.test(region));
  return (BRAZIL_PLACE.test(job.locationText) || UF_SUFFIX.test(job.locationText)) && !OPEN_TO_BRAZIL_WIDE.test(job.locationText);
}

const OPEN_TO_BRAZIL_WIDE = /\b(latam|latin america|am[eé]rica latina|south america|americas|worldwide|anywhere|global)\b/i;

// "Email Specialist - Spain", "Account Manager (Mexico)": a country in the title
// names where the job is, whatever the region list says.
const TITLE_COUNTRY =
  /(?:\s[-–—|]\s*|\()\s*(spain|espa[nñ]a|mexico|m[eé]xico|portugal|argentina|colombia|chile|peru|uruguay|paraguay|ecuador|bolivia|venezuela|costa rica|guatemala|panama|dominican republic|puerto rico|us|usa|united states|canada|uk|united kingdom|ireland|germany|france|italy|netherlands|poland|romania|india|philippines|pakistan|nigeria|kenya|south africa|egypt|australia|new zealand|japan|singapore|indonesia|vietnam|turkey)\s*\)?\s*$/i;

export function titleCountry(title: string): string | undefined {
  return title.match(TITLE_COUNTRY)?.[1];
}

const isRemote = (job: JobPosting) =>
  job.workplace === "remote" || (job.workplace === "unknown" && REMOTE_WORDS.test(`${job.title} ${job.locationText}`));

function nationalEligibility(job: JobPosting, prefs: Preferences): Omit<Eligibility, "title"> {
  if (!isBrazilJob(job)) return { verdict: "ineligible", track: "none", reasons: ["fora do Brasil"] };
  const where = fold(`${job.locationText} ${job.description.slice(0, 600)}`);
  const cityMatch = prefs.city ? where.includes(fold(prefs.city)) : false;
  const remote = isRemote(job) || (job.workplace === "unknown" && REMOTE_WORDS.test(job.description.slice(0, 1500)));
  if (remote) return { verdict: "eligible", track: "national", reasons: ["remoto no Brasil"] };
  const label = job.workplace === "hybrid" ? "híbrido" : job.workplace === "onsite" ? "presencial" : "modelo não informado";
  if (prefs.workplace === "remote") {
    return job.workplace === "unknown"
      ? { verdict: "unclear", track: "national", reasons: ["modelo de trabalho não informado"] }
      : { verdict: "ineligible", track: "none", reasons: [`${label} em ${job.locationText || "local não informado"}`] };
  }
  if (job.workplace === "onsite" && prefs.workplace === "remote_or_hybrid") {
    return { verdict: "ineligible", track: "none", reasons: [`presencial em ${job.locationText || "local não informado"}`] };
  }
  if (cityMatch) return { verdict: "eligible", track: "national", reasons: [`${label} em ${prefs.city}`] };
  return { verdict: "ineligible", track: "none", reasons: [`${label} em ${job.locationText || "outra cidade"}`] };
}

function globalEligibility(job: JobPosting, prefs: Preferences): Omit<Eligibility, "title"> {
  if (!isRemote(job)) return { verdict: "ineligible", track: "none", reasons: [`${job.workplace === "unknown" ? "não diz que é remota" : job.workplace === "hybrid" ? "híbrida" : "presencial"} fora do Brasil`] };
  const titlePlace = job.title.match(TITLE_PLACE)?.[1]?.trim();
  if (titlePlace && !OPEN_TO_BRAZIL.test(titlePlace) && !BRAZIL_PLACE.test(titlePlace) && !/^(first|friendly|only|optional|ok|contract(or)?|full[- ]?time|part[- ]?time|freelance|permanent)$/i.test(titlePlace)) {
    return { verdict: "ineligible", track: "none", reasons: [`remota só em "${titlePlace}"`] };
  }
  const country = titleCountry(job.title);
  if (country) return { verdict: "ineligible", track: "none", reasons: [`vaga para ${country}`] };
  if (job.regions.length > 0) {
    const open = job.regions.filter((region) => OPEN_TO_BRAZIL.test(region) || BRAZIL_PLACE.test(region));
    return open.length > 0
      ? { verdict: "eligible", track: "global", reasons: [`aberta a ${open.slice(0, 3).join(", ")}`] }
      : { verdict: "ineligible", track: "none", reasons: [`remota só em ${job.regions.slice(0, 4).join(", ")}${job.regions.length > 4 ? "…" : ""}`] };
  }
  const [low, high] = [prefs.utc_offset - 2, prefs.utc_offset + 2];
  if (job.timezones.length > 0 && !job.timezones.some((tz) => tz >= low && tz <= high)) {
    return { verdict: "ineligible", track: "none", reasons: [`fusos ${job.timezones.join(", ")} não incluem UTC${prefs.utc_offset}`] };
  }
  const restrictionIn = (text: string) => RESTRICTED_REMOTE.map((pattern) => text.match(pattern)?.[0]).find(Boolean)?.trim();
  const locationRestriction = restrictionIn(job.locationText);
  if (locationRestriction && !OPEN_TO_BRAZIL.test(job.locationText)) {
    return { verdict: "ineligible", track: "none", reasons: [`local: "${locationRestriction}"`] };
  }
  const text = `${job.locationText}\n${job.regions.join(", ")}\n${job.description}`;
  const restriction = restrictionIn(text);
  const opening = text.match(OPEN_TO_BRAZIL)?.[0];
  if (restriction && !opening) return { verdict: "ineligible", track: "none", reasons: [`restrita: "${restriction}"`] };
  if (opening && !restriction) return { verdict: "eligible", track: "global", reasons: [`menciona "${opening}"`] };
  if (opening && restriction) return { verdict: "unclear", track: "global", reasons: [`menciona "${opening}" mas também "${restriction}"`] };
  const weak = text.match(WEAKLY_OPEN)?.[0];
  if (weak) return { verdict: "unclear", track: "global", reasons: [`só diz "${weak}"`] };
  return { verdict: "unclear", track: "global", reasons: ["remota, região não informada"] };
}

// --- Gate ----------------------------------------------------------------------

const AFFIRMATIVE = /\b(vaga )?(afirmativa|exclusiva para (pcd|pessoas|mulheres|negr))|\bpcd\b.{0,20}exclusiv|exclusiv.{0,20}\bpcd\b/i;

export function assessEligibility(job: JobPosting, prefs: Preferences, profile: Pick<Profile, "languages" | "basics">): Eligibility {
  const title = titleMatch(job.title, prefs);
  const out = (verdict: Eligibility["verdict"], reasons: string[], track: Eligibility["track"] = "none"): Eligibility => ({ verdict, track, reasons, title: title.level });

  if (prefs.avoid_companies.some((company) => fold(job.company).includes(fold(company)))) return out("ineligible", ["empresa que você pediu para evitar"]);
  if (title.level === "none") return out("ineligible", ["cargo fora do seu objetivo"]);
  const excluded = excludedBy(job.title, prefs);
  if (excluded) return out("ineligible", [`cargo: "${excluded}"`]);
  if (/talent_pool|banco de talentos/i.test(`${job.employmentType ?? ""} ${job.title}`)) return out("ineligible", ["banco de talentos, não é uma vaga aberta"]);

  const notes: string[] = [];
  const required = requiredLanguage(job.description);
  if (required) {
    const have = spokenLevel(profile, required.language);
    if (have < 3) return out("ineligible", [`exige ${LANGUAGE_PT[required.language]}: "${required.quote}"`]);
  }
  const postingLanguage = detectLanguage(job.description);
  if (postingLanguage === "en" && spokenLevel(profile, "english") < 2) notes.push("vaga escrita em inglês");
  if (postingLanguage === "es" && spokenLevel(profile, "spanish") < 2) notes.push("vaga escrita em espanhol");
  if (AFFIRMATIVE.test(job.title)) notes.push("vaga afirmativa: confira se você se encaixa");

  const usd = annualUsd(job.salary);
  const floor = floorUsd(prefs);
  if (usd !== undefined && floor && usd < floor * 0.75) return out("ineligible", ["salário abaixo da sua pretensão"]);

  let location: Omit<Eligibility, "title">;
  if (prefs.scope === "national") location = nationalEligibility(job, prefs);
  else if (prefs.scope === "global") {
    location = job.source === "gupy" ? { verdict: "ineligible", track: "none", reasons: ["vaga nacional"] } : globalEligibility(job, prefs);
  } else location = isBrazilJob(job) ? nationalEligibility(job, prefs) : globalEligibility(job, prefs);

  const verdict = location.verdict === "eligible" && notes.length > 0 ? "unclear" : location.verdict;
  return { ...location, verdict, reasons: [...location.reasons, ...(location.verdict === "ineligible" ? [] : notes)], title: title.level };
}
