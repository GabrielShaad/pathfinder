import PDFDocument from "pdfkit";
import { font, NO_LIGATURES } from "./fonts.js";

// Shared pdfkit helpers. Text only (no images, no tables, no columns), so every
// word survives an ATS parser reading the text layer.

export type Doc = InstanceType<typeof PDFDocument>;

export const PAPER = { a4: "A4", "us-letter": "LETTER" } as const;
export const CM = 28.3465;

export function createDoc(options: { paper?: "a4" | "us-letter"; layout?: "portrait" | "landscape"; title: string; author: string; lang: string; margins?: { top: number; bottom: number; left: number; right: number } }): Doc {
  const doc = new PDFDocument({
    size: PAPER[options.paper ?? "a4"],
    layout: options.layout ?? "portrait",
    margins: options.margins ?? { top: 1.4 * CM, bottom: 1.4 * CM, left: 1.7 * CM, right: 1.7 * CM },
    // Our own font from the start: pdfkit's built-in Helvetica needs files a bundle lacks.
    font: font("Regular"),
    info: { Title: options.title, Author: options.author, Creator: "Pathfinder" },
    lang: options.lang,
    displayTitle: true,
    bufferPages: true,
  });
  doc.registerFont("Regular", font("Regular"));
  doc.registerFont("Bold", font("Bold"));
  doc.registerFont("Medium", font("Medium"));
  doc.registerFont("Italic", font("Italic"));
  return doc;
}

export const textOptions = (extra: Record<string, unknown> = {}) => ({ features: NO_LIGATURES, ...extra }) as unknown as PDFKit.Mixins.TextOptions;

export function toBuffer(doc: Doc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export const contentWidth = (doc: Doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;

// Starts a new page when fewer than `needed` points are left.
export function keepSpace(doc: Doc, needed: number): void {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

export function bullet(doc: Doc, text: string, size: number, indent = 10): void {
  const x = doc.page.margins.left;
  keepSpace(doc, size * 2);
  const y = doc.y;
  doc.font("Regular").fontSize(size).text("•", x + 2, y, textOptions({ lineBreak: false }));
  doc.text(text, x + indent + 2, y, textOptions({ width: contentWidth(doc) - indent - 2, lineGap: 1.2 }));
  doc.x = x;
  doc.moveDown(0.25);
}

// "Left text ........ right text" on one baseline (a role and its dates).
export function leftRight(doc: Doc, left: string, right: string, size: number, leftFont = "Bold"): void {
  const x = doc.page.margins.left;
  keepSpace(doc, size * 3);
  const y = doc.y;
  const width = contentWidth(doc);
  doc.font("Regular").fontSize(size);
  const rightWidth = right ? doc.widthOfString(right, textOptions()) : 0;
  doc.font(leftFont).fontSize(size).text(left, x, y, textOptions({ width: width - rightWidth - 12 }));
  const after = doc.y;
  if (right) doc.font("Regular").fontSize(size).text(right, x + width - rightWidth, y, textOptions({ lineBreak: false }));
  doc.x = x;
  doc.y = Math.max(after, y + size * 1.25);
}
