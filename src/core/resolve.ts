import { formatRange, LABELS, type Labels } from "./i18n.js";
import { translated, type Lang, type Profile, type Role } from "./profile.js";
import type { ResumeDoc } from "./resume.js";

// Everything the renderers need, already as display strings. Renderers never look
// at the profile, so whatever reaches the PDF went through verifyResume.
export interface ResolvedResume {
  language: Lang;
  labels: Labels;
  paper: "a4" | "us-letter";
  name: string;
  headline: string;
  contact: { text: string; url?: string }[];
  summary: string;
  skills: { category: string; items: string[] }[];
  experience: { title: string; company: string; meta: string; dates: string; bullets: string[] }[];
  earlier: string[];
  projects: { name: string; meta: string; url?: string; bullets: string[] }[];
  education: { degree: string; institution: string; dates: string; detail?: string }[];
  languages: string;
  certifications: string[];
}

const displayUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

function roleMeta(role: Role, lang: Lang, labels: Labels): string {
  const parts: string[] = [];
  const context = role.company_context ? translated(role.i18n, lang, "company_context", role.company_context) : "";
  if (context) parts.push(context);
  if (role.client) parts.push(`${labels.client}: ${role.client}`);
  if (role.employment_type !== "full-time") parts.push(labels.employment[role.employment_type]);
  if (role.location) parts.push(translated(role.i18n, lang, "location", role.location));
  return parts.join(" · ");
}

export function resolveResume(profile: Profile, doc: ResumeDoc): ResolvedResume {
  const lang = doc.language;
  const labels = LABELS[lang];
  const role = (id: string) => {
    const found = profile.roles.find((r) => r.id === id);
    if (!found) throw new Error(`Unknown role "${id}"`);
    return found;
  };
  // Reverse-chronological order comes from the profile, whatever order the writer used.
  const order = (id: string) => profile.roles.findIndex((r) => r.id === id);
  const experience = [...doc.experience].sort((a, b) => order(a.role_id) - order(b.role_id));
  const earlier = [...doc.earlier_role_ids].sort((a, b) => order(a) - order(b));
  const basics = profile.basics;

  return {
    language: lang,
    labels,
    paper: doc.paper,
    name: basics.name,
    headline: doc.headline,
    contact: [
      ...(basics.location ? [{ text: translated(basics.i18n, lang, "location", basics.location) }] : []),
      ...(basics.availability ? [{ text: translated(basics.i18n, lang, "availability", basics.availability) }] : []),
      { text: basics.email, url: `mailto:${basics.email}` },
      ...(basics.phone ? [{ text: basics.phone }] : []),
      ...basics.links.map((link) => ({ text: displayUrl(link.url), url: link.url })),
    ],
    summary: doc.summary.text,
    skills: doc.skills.map((group) => ({ category: group.category, items: group.items })),
    experience: experience.map((entry) => {
      const r = role(entry.role_id);
      return {
        title: translated(r.i18n, lang, "title", r.title),
        company: r.company,
        meta: roleMeta(r, lang, labels),
        dates: formatRange(r.start, r.end, lang),
        bullets: entry.bullets.map((bullet) => bullet.text),
      };
    }),
    earlier: earlier.map((id) => {
      const r = role(id);
      const [from, to] = [r.start.slice(0, 4), r.end ? r.end.slice(0, 4) : labels.present];
      const years = from === to ? from : `${from}–${to}`;
      return `${translated(r.i18n, lang, "title", r.title)}, ${r.company}, ${years}`;
    }),
    projects: doc.projects.map((entry) => {
      const project = profile.projects.find((p) => p.id === entry.project_id);
      if (!project) throw new Error(`Unknown project "${entry.project_id}"`);
      return {
        name: translated(project.i18n, lang, "name", project.name),
        meta: [project.role ? translated(project.i18n, lang, "role", project.role) : "", project.period].filter(Boolean).join(" · "),
        url: project.url,
        bullets: entry.bullets.map((bullet) => bullet.text),
      };
    }),
    education: doc.education_ids.map((id) => {
      const education = profile.education.find((e) => e.id === id);
      if (!education) throw new Error(`Unknown education "${id}"`);
      const degree = translated(education.i18n, lang, "degree", education.degree);
      const field = education.field ? translated(education.i18n, lang, "field", education.field) : "";
      const detail = education.detail ? translated(education.i18n, lang, "detail", education.detail) : undefined;
      return {
        degree: [degree, field].filter(Boolean).join(", "),
        institution: education.institution,
        dates: formatRange(education.start, education.end ?? null, lang),
        detail,
      };
    }),
    languages: profile.languages
      .filter((language) => language.confirmed)
      .map((language) => `${translated(language.i18n, lang, "name", language.name)} (${translated(language.i18n, lang, "level", language.level)})`)
      .join(" · "),
    certifications: profile.certifications.map((c) => [translated(c.i18n, lang, "name", c.name), c.issuer, c.year].filter(Boolean).join(", ")),
  };
}

// Plain text in reading order, for keyword coverage before any PDF exists.
export function resumeText(resume: ResolvedResume): string {
  return [
    resume.headline,
    resume.summary,
    ...resume.skills.map((group) => `${group.category}: ${group.items.join(", ")}`),
    ...resume.experience.flatMap((e) => [`${e.title}, ${e.company} (${e.dates}) ${e.meta}`.trim(), ...e.bullets]),
    ...resume.earlier,
    ...resume.projects.flatMap((p) => [p.name, p.meta, ...p.bullets]),
    ...resume.education.map((e) => `${e.degree}, ${e.institution} (${e.dates})`),
    resume.languages,
    ...resume.certifications,
  ].join("\n");
}
