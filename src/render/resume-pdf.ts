import type { ResolvedResume } from "../core/index.js";
import { bullet, contentWidth, createDoc, keepSpace, leftRight, textOptions, toBuffer, type Doc } from "./pdf.js";

// ATS-safe resume (port of Horizon's Typst template): one column, real headings,
// no tables or icons, no ligatures, each role's dates on the same line as the role.

const BODY = 9.8;

function heading(doc: Doc, text: string): void {
  keepSpace(doc, 48);
  doc.moveDown(0.7);
  const x = doc.page.margins.left;
  doc.font("Bold").fontSize(10.5).fillColor("#000").text(text.toUpperCase(), x, doc.y, textOptions());
  const y = doc.y + 1;
  doc.moveTo(x, y).lineTo(x + contentWidth(doc), y).lineWidth(0.5).strokeColor("#787878").stroke();
  doc.y = y + 4;
  doc.x = x;
}

function paragraph(doc: Doc, text: string, options: { font?: string; size?: number; color?: string } = {}): void {
  doc
    .font(options.font ?? "Regular")
    .fontSize(options.size ?? BODY)
    .fillColor(options.color ?? "#000")
    .text(text, doc.page.margins.left, doc.y, textOptions({ width: contentWidth(doc), lineGap: 1.2 }));
}

export async function renderResumePdf(resume: ResolvedResume): Promise<Buffer> {
  const labels = resume.labels;
  const doc = createDoc({ paper: resume.paper, title: `${resume.name} - ${labels.resumeFile}`, author: resume.name, lang: resume.language === "pt" ? "pt-BR" : resume.language });
  const x = doc.page.margins.left;

  doc.font("Bold").fontSize(19).text(resume.name, x, doc.y, textOptions());
  doc.moveDown(0.1);
  doc.font("Medium").fontSize(11).text(resume.headline, textOptions({ width: contentWidth(doc) }));
  doc.moveDown(0.25);

  // Contact items separated by " | "; links stay clickable.
  doc.font("Regular").fontSize(BODY);
  resume.contact.forEach((item, i) => {
    const last = i === resume.contact.length - 1;
    const text = item.text + (last ? "" : "  |  ");
    doc.text(text, textOptions({ continued: !last, link: item.url ?? null, underline: false, width: contentWidth(doc) }));
  });

  heading(doc, labels.summary);
  paragraph(doc, resume.summary);

  if (resume.skills.length > 0) {
    heading(doc, labels.skills);
    for (const group of resume.skills) {
      doc.font("Bold").fontSize(BODY).text(`${group.category}: `, x, doc.y, textOptions({ continued: true, width: contentWidth(doc) }));
      doc.font("Regular").text(group.items.join(", "), textOptions({ lineGap: 1.2 }));
      doc.moveDown(0.15);
    }
  }

  if (resume.experience.length > 0 || resume.earlier.length > 0) {
    heading(doc, labels.experience);
    for (const entry of resume.experience) {
      leftRight(doc, `${entry.title}, ${entry.company}`, entry.dates, BODY);
      if (entry.meta) {
        doc.font("Italic").fontSize(9).text(entry.meta, x, doc.y, textOptions({ width: contentWidth(doc) }));
        doc.moveDown(0.2);
      }
      doc.moveDown(0.15);
      for (const text of entry.bullets) bullet(doc, text, BODY);
      doc.moveDown(0.45);
    }
    if (resume.earlier.length > 0) {
      keepSpace(doc, 30);
      doc.font("Bold").fontSize(BODY).text(labels.earlier, x, doc.y, textOptions());
      doc.moveDown(0.2);
      for (const text of resume.earlier) bullet(doc, text, BODY);
    }
  }

  if (resume.projects.length > 0) {
    heading(doc, labels.projects);
    for (const project of resume.projects) {
      keepSpace(doc, 36);
      doc.font("Bold").fontSize(BODY).text(project.name, x, doc.y, textOptions({ continued: Boolean(project.meta) }));
      if (project.meta) doc.font("Regular").text(`, ${project.meta}`, textOptions());
      if (project.url) {
        const display = project.url.replace(/^https?:\/\/(www\.)?/, "");
        doc.font("Regular").fontSize(9).text(display, x, doc.y, textOptions({ link: project.url }));
      }
      doc.moveDown(0.15);
      for (const text of project.bullets) bullet(doc, text, BODY);
      doc.moveDown(0.4);
    }
  }

  if (resume.education.length > 0) {
    heading(doc, labels.education);
    for (const education of resume.education) {
      leftRight(doc, education.degree, education.dates, BODY);
      doc.font("Regular").fontSize(BODY).text(education.institution, x, doc.y, textOptions({ continued: Boolean(education.detail), width: contentWidth(doc) }));
      if (education.detail) doc.font("Italic").fontSize(9).text(` · ${education.detail}`, textOptions());
      doc.moveDown(0.5);
    }
  }

  if (resume.languages) {
    heading(doc, labels.languages);
    paragraph(doc, resume.languages);
  }

  if (resume.certifications.length > 0) {
    heading(doc, labels.certifications);
    for (const text of resume.certifications) bullet(doc, text, BODY);
  }

  return toBuffer(doc);
}
