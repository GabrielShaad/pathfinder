import { contentWidth, createDoc, keepSpace, textOptions, toBuffer } from "./pdf.js";

// The job list of one search, as cards rather than a cramped table: easy to read
// on a phone, links clickable, nothing cut off.

export interface JobCard {
  ref: string;
  title: string;
  company: string;
  url: string;
  location: string;
  salary?: string;
  employment?: string;
  posted?: string;
  score?: number;
  verdict?: "apply" | "maybe" | "skip";
  why?: string;
  gaps: string[];
  reasons: string[];
  source: string;
  letter?: string;
  isNew: boolean;
}

export interface JobListInput {
  name: string;
  date: Date;
  summary: string;
  cards: JobCard[];
  sources: string[];
}

export const VERDICT_LABEL = { apply: "Recomendada", maybe: "Vale olhar", skip: "Pouco aderente" } as const;
const VERDICT_COLOR = { apply: "#1b7f3b", maybe: "#9a6700", skip: "#666666" } as const;

export async function renderJobListPdf(input: JobListInput): Promise<Buffer> {
  const day = input.date.toLocaleDateString("pt-BR");
  const doc = createDoc({ title: `Vagas ${day} - ${input.name}`, author: input.name, lang: "pt-BR" });
  const x = doc.page.margins.left;
  const width = contentWidth(doc);

  doc.font("Bold").fontSize(18).text(`Vagas para ${input.name}`, x, doc.y, textOptions());
  doc.font("Regular").fontSize(10).fillColor("#444").text(`Busca de ${day}. ${input.summary}`, textOptions({ width }));
  doc.moveDown(0.3);
  doc.fontSize(9).text("Nota de 0 a 100: o quanto a vaga combina com o seu perfil e as suas preferências. Confira os requisitos antes de se candidatar.", textOptions({ width }));
  doc.fillColor("#000").moveDown(0.8);

  input.cards.forEach((card, index) => {
    keepSpace(doc, 110);
    const top = doc.y;
    const verdict = card.verdict ? VERDICT_LABEL[card.verdict] : "Sem avaliação";
    const color = card.verdict ? VERDICT_COLOR[card.verdict] : "#666666";
    const badge = `${card.score !== undefined ? `${card.score} · ` : ""}${verdict}${card.isNew ? " · nova" : ""}`;

    doc.font("Bold").fontSize(9).fillColor(color);
    const badgeWidth = doc.widthOfString(badge, textOptions());
    doc.text(badge, x + width - badgeWidth, top, textOptions({ lineBreak: false }));
    doc.fillColor("#000").font("Bold").fontSize(11.5).text(`${index + 1}. ${card.title}`, x, top, textOptions({ width: width - badgeWidth - 14 }));
    doc.font("Medium").fontSize(10).text(card.company, textOptions({ width }));

    const meta = [card.location, card.employment, card.salary, card.posted ? `publicada em ${card.posted}` : undefined].filter(Boolean).join("  ·  ");
    doc.font("Regular").fontSize(9).fillColor("#444").text(meta, textOptions({ width }));
    doc.fillColor("#000");
    if (card.why) {
      doc.moveDown(0.2);
      doc.font("Bold").fontSize(9.5).text("Por que combina: ", x, doc.y, textOptions({ continued: true, width }));
      doc.font("Regular").text(card.why, textOptions({ lineGap: 1 }));
    }
    const attention = [...card.gaps, ...card.reasons.filter((reason) => /inglês|espanhol|afirmativa|não informad|mas também|só diz/i.test(reason))];
    if (attention.length > 0) {
      doc.font("Bold").fontSize(9.5).fillColor("#9a6700").text("Atenção: ", x, doc.y, textOptions({ continued: true, width }));
      doc.font("Regular").fillColor("#000").text(attention.join("; "), textOptions({ lineGap: 1 }));
    }
    if (card.letter) doc.font("Regular").fontSize(9).fillColor("#1b7f3b").text(`Carta de apresentação pronta: Vagas/Cartas/${card.letter}`, x, doc.y, textOptions({ width }));
    doc.font("Regular").fontSize(9).fillColor("#0b57d0").text(card.url, x, doc.y, textOptions({ width, link: card.url, underline: true }));
    doc.fillColor("#666").fontSize(8).text(`Fonte: ${card.source} · código ${card.ref}`, textOptions({ width }));
    doc.fillColor("#000");
    const bottom = doc.y + 6;
    doc.moveTo(x, bottom).lineTo(x + width, bottom).lineWidth(0.4).strokeColor("#cccccc").stroke();
    doc.y = bottom + 8;
  });

  if (input.cards.length === 0) doc.font("Regular").fontSize(11).text("Nenhuma vaga passou pelos filtros nesta busca.", textOptions());

  doc.moveDown(1);
  keepSpace(doc, 50);
  doc.font("Regular").fontSize(8).fillColor("#666").text(
    `Fontes consultadas: ${input.sources.join(", ")}. Vagas do Jobicy (jobicy.com) e do Remotive (remotive.com) são exibidas com link para a página original. O Pathfinder não envia candidaturas: você decide e se candidata pelo link de cada vaga.`,
    x,
    doc.y,
    textOptions({ width }),
  );
  return toBuffer(doc);
}
