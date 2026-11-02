import { Document, Packer, Paragraph, TextRun } from "docx";
import type { Lang } from "../core/index.js";
import { contentWidth, createDoc, textOptions, toBuffer } from "./pdf.js";

// A cover letter as PDF and DOCX: the person's name and contacts on top, the date,
// then the letter text exactly as written (paragraphs split on blank lines).

export interface LetterInput {
  name: string;
  contact: string[];
  language: Lang;
  text: string;
  date?: Date;
  paper?: "a4" | "us-letter";
}

const LOCALE: Record<Lang, string> = { pt: "pt-BR", en: "en-US", es: "es-ES" };

export const letterDate = (language: Lang, date = new Date()) =>
  date.toLocaleDateString(LOCALE[language], { day: "numeric", month: "long", year: "numeric" });

export const paragraphs = (text: string) =>
  text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);

export async function renderLetterPdf(input: LetterInput): Promise<Buffer> {
  const doc = createDoc({ paper: input.paper, title: `${input.name} - Cover letter`, author: input.name, lang: LOCALE[input.language], margins: { top: 2.2 * 28.35, bottom: 2.2 * 28.35, left: 2.4 * 28.35, right: 2.4 * 28.35 } });
  const x = doc.page.margins.left;
  doc.font("Bold").fontSize(15).text(input.name, x, doc.y, textOptions());
  doc.font("Regular").fontSize(9.5).fillColor("#333").text(input.contact.join("  |  "), textOptions({ width: contentWidth(doc) }));
  doc.fillColor("#000").moveDown(1.5);
  doc.font("Regular").fontSize(10.5).text(letterDate(input.language, input.date), textOptions());
  doc.moveDown(1.2);
  for (const block of paragraphs(input.text)) {
    doc.font("Regular").fontSize(10.5).text(block, x, doc.y, textOptions({ width: contentWidth(doc), lineGap: 2.5, align: "left" }));
    doc.moveDown(0.8);
  }
  return toBuffer(doc);
}

export async function renderLetterDocx(input: LetterInput): Promise<Buffer> {
  const run = (text: string, options: { bold?: boolean; size?: number } = {}) => new TextRun({ text, font: "Arial", size: options.size ?? 21, bold: options.bold });
  const doc = new Document({
    creator: input.name,
    title: `${input.name} - Cover letter`,
    sections: [
      {
        properties: { page: { margin: { top: 1247, bottom: 1247, left: 1361, right: 1361 } } },
        children: [
          new Paragraph({ children: [run(input.name, { bold: true, size: 30 })] }),
          new Paragraph({ spacing: { after: 360 }, children: [run(input.contact.join("  |  "), { size: 19 })] }),
          new Paragraph({ spacing: { after: 280 }, children: [run(letterDate(input.language, input.date))] }),
          ...paragraphs(input.text).map((block) => new Paragraph({ spacing: { after: 200, line: 300 }, children: [run(block)] })),
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
