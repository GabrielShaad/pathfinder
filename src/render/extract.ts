import JSZip from "jszip";
import { decodeEntities } from "../core/index.js";
import { pdfText } from "./ats-check.js";

// Reads the person's current resume (PDF, DOCX, ODT, TXT, MD) as plain text, and
// diagnoses it the way an ATS would see it.

export const RESUME_EXTENSIONS = [".pdf", ".docx", ".odt", ".txt", ".md"] as const;

const xmlToText = (xml: string, paragraphEnd: RegExp) =>
  decodeEntities(
    xml
      .replace(/<w:tab\/>|<text:tab\/>/g, "\t")
      .replace(/<w:br[^>]*\/>|<text:line-break\/>/g, "\n")
      .replace(paragraphEnd, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export async function extractResumeText(data: Uint8Array, extension: string): Promise<{ text: string; pages?: number }> {
  switch (extension.toLowerCase()) {
    case ".pdf": {
      const { text, pages } = await pdfText(data);
      return { text: text.trim(), pages };
    }
    case ".docx": {
      const zip = await JSZip.loadAsync(data);
      const xml = await zip.file("word/document.xml")?.async("string");
      if (!xml) throw new Error("This .docx has no document body.");
      return { text: xmlToText(xml, /<\/w:p>/g) };
    }
    case ".odt": {
      const zip = await JSZip.loadAsync(data);
      const xml = await zip.file("content.xml")?.async("string");
      if (!xml) throw new Error("This .odt has no content.");
      return { text: xmlToText(xml, /<\/text:(p|h)>/g) };
    }
    default:
      return { text: Buffer.from(data).toString("utf8").trim() };
  }
}

const SECTION_WORDS = [
  /resumo|perfil profissional|objetivo|summary|profile|about/i,
  /experi[eê]ncia|experience|hist[oó]rico profissional|employment/i,
  /forma[cç][aã]o|educa[cç][aã]o|escolaridade|education/i,
  /habilidades|compet[eê]ncias|skills|conhecimentos/i,
  /idiomas|languages/i,
];

export interface ResumeDiagnosis {
  hasText: boolean;
  pages?: number;
  words: number;
  email: boolean;
  phone: boolean;
  linkedin: boolean;
  sectionsFound: number;
  datesFound: number;
  notes: string[];
}

// What an ATS would struggle with in the original. Notes are in Portuguese for the person.
export function diagnoseResume(text: string, pages?: number): ResumeDiagnosis {
  const words = (text.match(/[\p{L}\d]+/gu) ?? []).length;
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const email = /[\w.+-]+@[\w-]+\.[\w.]+/.test(text);
  const phone = /(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/.test(text) || /\+\d[\d\s().-]{8,}/.test(text);
  const linkedin = /linkedin\.com\/in\//i.test(text);
  const sectionsFound = SECTION_WORDS.filter((pattern) => lines.some((line) => line.length < 40 && pattern.test(line))).length;
  const datesFound = (text.match(/\b(19|20)\d{2}\b/g) ?? []).length;
  const notes: string[] = [];
  if (words < 40) notes.push("O arquivo quase não tem texto legível: parece uma imagem ou escaneado. Sistemas de recrutamento (ATS) não conseguem ler.");
  if (!email) notes.push("Não encontrei um e-mail no texto do currículo.");
  if (!phone) notes.push("Não encontrei um telefone no texto do currículo.");
  if (words >= 40 && sectionsFound < 3) notes.push("Poucas seções com títulos padrão (Resumo, Experiência, Formação, Habilidades). O ATS usa esses títulos para entender o currículo.");
  if (pages !== undefined && pages > 2) notes.push(`O currículo tem ${pages} páginas; o ideal é 1 ou 2.`);
  if (words >= 40 && datesFound < 2) notes.push("Quase não há datas: recrutadores e ATS procuram mês e ano de início e fim de cada experiência.");
  return { hasText: words >= 40, pages, words, email, phone, linkedin, sectionsFound, datesFound, notes };
}
