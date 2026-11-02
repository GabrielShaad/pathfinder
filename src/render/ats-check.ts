import { extractText, getDocumentProxy } from "unpdf";
import type { Issue, ResolvedResume } from "../core/index.js";

export interface AtsReport {
  pages: number;
  text: string;
  issues: Issue[];
}

const MAX_PAGES = 2;

export async function pdfText(pdf: Uint8Array): Promise<{ pages: number; text: string }> {
  const proxy = await getDocumentProxy(new Uint8Array(pdf));
  const { totalPages, text } = await extractText(proxy, { mergePages: false });
  return { pages: totalPages, text: (text as string[]).join("\n") };
}

// Reads the PDF back the way a parser does (text layer only) and checks that what a
// recruiter needs survived: contacts, section order, each role's dates on the same
// line as the role (ported from Horizon, with localized headings).
export async function checkPdf(pdf: Uint8Array, resume: ResolvedResume): Promise<AtsReport> {
  const { pages, text } = await pdfText(pdf);
  const lines = text.split("\n").map((l) => l.replace(/\s+/g, " ").trim());
  const issues: Issue[] = [];
  const error = (where: string, message: string) => issues.push({ level: "error", where, message });
  const warn = (where: string, message: string) => issues.push({ level: "warning", where, message });

  if (pages > MAX_PAGES) warn("pdf", `${pages} pages (aim for ${MAX_PAGES} at most)`);
  if (/[ﬀ-ﬆ�]/.test(text)) error("pdf", "ligatures or unknown glyphs in the text layer");

  const digits = (value: string) => value.replace(/\D/g, "");
  const flat = text.replace(/\s+/g, " ");
  for (const item of resume.contact) {
    // Parsers often split phone numbers, so compare digits only.
    const isPhone = /^\+?[\d\s().-]+$/.test(item.text);
    const found = isPhone ? digits(text).includes(digits(item.text)) : flat.includes(item.text);
    if (!found) error("contact", `"${item.text}" not readable in the PDF`);
  }
  if (!flat.includes(resume.name)) error("contact", "name not readable in the PDF");

  const labels = resume.labels;
  const order = [labels.summary, labels.skills, labels.experience, labels.projects, labels.education, labels.languages].map((label) => label.toUpperCase());
  let cursor = -1;
  for (const section of order) {
    const at = lines.findIndex((line) => line === section);
    if (at === -1) continue;
    if (at < cursor) error("sections", `"${section}" is out of order`);
    cursor = at;
  }
  const required = [labels.summary.toUpperCase(), ...(resume.skills.length ? [labels.skills.toUpperCase()] : []), ...(resume.experience.length ? [labels.experience.toUpperCase()] : [])];
  for (const heading of required) if (!lines.includes(heading)) error("sections", `heading "${heading}" not found as its own line`);

  for (const e of resume.experience) {
    const header = `${e.title}, ${e.company}`;
    const line = lines.find((l) => l.startsWith(header));
    if (!line) error(`experience/${e.company}`, `role line "${header}" not found`);
    else if (!line.includes(e.dates)) error(`experience/${e.company}`, `dates "${e.dates}" are not on the role line`);
  }
  return { pages, text, issues };
}
