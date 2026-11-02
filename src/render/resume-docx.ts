import { BorderStyle, Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TabStopType, TextRun } from "docx";
import type { ResolvedResume } from "../core/index.js";

// Some ATS (older Workday/Taleo setups, many agencies) parse Word better than PDF.
// Same content and order as the PDF (ported from Horizon).

const FONT = "Arial";
const RIGHT_TAB = 9900; // twips: right edge of the text area with ~1.7 cm margins

const plain = (text: string, options: { italic?: boolean; bold?: boolean; size?: number } = {}) =>
  new TextRun({ text, font: FONT, size: options.size ?? 19, italics: options.italic, bold: options.bold });

const heading = (text: string) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "777777", space: 1 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 21, font: FONT, color: "000000" })],
  });

const line = (left: TextRun[], right?: string) =>
  new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
    spacing: { before: 120, after: 40 },
    children: right ? [...left, plain(`\t${right}`)] : left,
  });

const bullet = (text: string) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 30 }, children: [plain(text)] });

export async function renderResumeDocx(resume: ResolvedResume): Promise<Buffer> {
  const labels = resume.labels;
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: resume.name, bold: true, size: 38, font: FONT, color: "000000" })] }),
    new Paragraph({ children: [plain(resume.headline, { size: 22 })] }),
    new Paragraph({
      spacing: { after: 120 },
      children: resume.contact.flatMap((item, i) => {
        const run = item.url ? new ExternalHyperlink({ link: item.url, children: [plain(item.text)] }) : plain(item.text);
        return i === 0 ? [run] : [plain("  |  "), run];
      }),
    }),
    heading(labels.summary),
    new Paragraph({ children: [plain(resume.summary)] }),
  ];

  if (resume.skills.length > 0) {
    children.push(heading(labels.skills));
    children.push(...resume.skills.map((g) => new Paragraph({ spacing: { after: 30 }, children: [plain(`${g.category}: `, { bold: true }), plain(g.items.join(", "))] })));
  }
  if (resume.experience.length > 0 || resume.earlier.length > 0) {
    children.push(heading(labels.experience));
    for (const e of resume.experience) {
      children.push(line([plain(`${e.title}, ${e.company}`, { bold: true })], e.dates));
      if (e.meta) children.push(new Paragraph({ spacing: { after: 40 }, children: [plain(e.meta, { italic: true, size: 18 })] }));
      children.push(...e.bullets.map(bullet));
    }
    if (resume.earlier.length > 0) children.push(line([plain(labels.earlier, { bold: true })]), ...resume.earlier.map(bullet));
  }
  if (resume.projects.length > 0) {
    children.push(heading(labels.projects));
    for (const p of resume.projects) {
      children.push(line([plain(p.name, { bold: true }), ...(p.meta ? [plain(`, ${p.meta}`)] : [])]));
      if (p.url) children.push(new Paragraph({ children: [new ExternalHyperlink({ link: p.url, children: [plain(p.url, { size: 18 })] })] }));
      children.push(...p.bullets.map(bullet));
    }
  }
  if (resume.education.length > 0) {
    children.push(heading(labels.education));
    for (const ed of resume.education) {
      children.push(line([plain(ed.degree, { bold: true })], ed.dates));
      children.push(new Paragraph({ children: [plain(ed.institution), ...(ed.detail ? [plain(` · ${ed.detail}`, { italic: true })] : [])] }));
    }
  }
  if (resume.languages) children.push(heading(labels.languages), new Paragraph({ children: [plain(resume.languages)] }));
  if (resume.certifications.length > 0) children.push(heading(labels.certifications), ...resume.certifications.map(bullet));

  const doc = new Document({
    creator: resume.name,
    title: `${resume.name} - ${labels.resumeFile}`,
    sections: [
      {
        properties: {
          page: {
            size: resume.paper === "us-letter" ? { width: 12240, height: 15840 } : { width: 11906, height: 16838 },
            margin: { top: 794, bottom: 794, left: 964, right: 964 },
          },
        },
        children,
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
