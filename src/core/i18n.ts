import type { Lang } from "./profile.js";

// Labels printed on generated documents. Section headings are the standard ones
// ATS parsers look for in each language.

export interface Labels {
  summary: string;
  skills: string;
  experience: string;
  projects: string;
  education: string;
  languages: string;
  certifications: string;
  earlier: string;
  present: string;
  client: string;
  familiar: string;
  resumeFile: string;
  employment: Record<"contract" | "part-time" | "freelance" | "internship", string>;
  months: string[];
  monthStyle: "name" | "numeric";
}

export const LABELS: Record<Lang, Labels> = {
  pt: {
    summary: "Resumo",
    skills: "Habilidades",
    experience: "Experiência Profissional",
    projects: "Projetos",
    education: "Formação Acadêmica",
    languages: "Idiomas",
    certifications: "Certificações",
    earlier: "Experiências anteriores",
    present: "Atual",
    client: "Cliente",
    familiar: "Conhecimentos básicos",
    resumeFile: "Curriculo",
    employment: { contract: "PJ/Contrato", "part-time": "Meio período", freelance: "Freelance", internship: "Estágio" },
    months: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"],
    monthStyle: "numeric",
  },
  en: {
    summary: "Summary",
    skills: "Skills",
    experience: "Experience",
    projects: "Projects",
    education: "Education",
    languages: "Languages",
    certifications: "Certifications",
    earlier: "Earlier experience",
    present: "Present",
    client: "Client",
    familiar: "Working knowledge",
    resumeFile: "Resume",
    employment: { contract: "Contract", "part-time": "Part-time", freelance: "Freelance", internship: "Internship" },
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    monthStyle: "name",
  },
  es: {
    summary: "Resumen",
    skills: "Habilidades",
    experience: "Experiencia Profesional",
    projects: "Proyectos",
    education: "Formación Académica",
    languages: "Idiomas",
    certifications: "Certificaciones",
    earlier: "Experiencia anterior",
    present: "Actualidad",
    client: "Cliente",
    familiar: "Conocimientos básicos",
    resumeFile: "Curriculum",
    employment: { contract: "Contrato", "part-time": "Medio tiempo", freelance: "Freelance", internship: "Prácticas" },
    months: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"],
    monthStyle: "numeric",
  },
};

// The working-knowledge group may carry any language's label.
export const FAMILIAR_LABELS = new Set(Object.values(LABELS).map((labels) => labels.familiar.toLowerCase()));

export function formatMonth(value: string, lang: Lang): string {
  const [year, month] = value.split("-");
  const labels = LABELS[lang];
  const name = labels.months[Number(month) - 1] ?? month;
  return labels.monthStyle === "numeric" ? `${name}/${year}` : `${name} ${year}`;
}

export function formatRange(start: string | undefined, end: string | null | undefined, lang: Lang): string {
  if (!start) return end ? formatMonth(end, lang) : "";
  return `${formatMonth(start, lang)} – ${end ? formatMonth(end, lang) : LABELS[lang].present}`;
}
