import ExcelJS from "exceljs";

// The cumulative tracking spreadsheet. The person edits Status and Anotações; the
// next export reads those two columns back first, so nothing they typed is lost.

export interface TrackerRow {
  ref: string;
  status: string;
  score?: number;
  verdict?: string;
  title: string;
  company: string;
  location: string;
  salary?: string;
  why?: string;
  attention?: string;
  url: string;
  source: string;
  found: string;
  letter?: string;
  notes?: string;
}

export const TRACKER_COLUMNS = [
  { header: "Código", key: "ref", width: 9 },
  { header: "Status", key: "status", width: 15 },
  { header: "Nota", key: "score", width: 7 },
  { header: "Avaliação", key: "verdict", width: 14 },
  { header: "Vaga", key: "title", width: 38 },
  { header: "Empresa", key: "company", width: 24 },
  { header: "Local / modelo", key: "location", width: 26 },
  { header: "Salário", key: "salary", width: 16 },
  { header: "Por que combina", key: "why", width: 50 },
  { header: "Atenção", key: "attention", width: 36 },
  { header: "Link", key: "url", width: 14 },
  { header: "Fonte", key: "source", width: 14 },
  { header: "Encontrada em", key: "found", width: 13 },
  { header: "Carta", key: "letter", width: 30 },
  { header: "Anotações", key: "notes", width: 36 },
] as const;

export async function readTrackerEdits(path: string): Promise<Map<string, { status?: string; notes?: string }>> {
  const edits = new Map<string, { status?: string; notes?: string }>();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.worksheets[0];
  if (!sheet) return edits;
  const header = (sheet.getRow(1).values as unknown[]).map((value) => String(value ?? "").trim());
  const col = (name: string) => header.indexOf(name);
  const [refCol, statusCol, notesCol] = [col("Código"), col("Status"), col("Anotações")];
  if (refCol < 0) return edits;
  sheet.eachRow((row, number) => {
    if (number === 1) return;
    const text = (index: number) => (index > 0 ? String(row.getCell(index).text ?? "").trim() : "");
    const ref = text(refCol);
    if (ref) edits.set(ref, { status: text(statusCol) || undefined, notes: text(notesCol) || undefined });
  });
  return edits;
}

export async function renderTracker(rows: TrackerRow[], statuses: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Pathfinder";
  const sheet = workbook.addWorksheet("Vagas", { views: [{ state: "frozen", ySplit: 1, xSplit: 0 }] });
  sheet.columns = TRACKER_COLUMNS.map((column) => ({ ...column }));
  for (const row of rows) {
    const added = sheet.addRow({ ...row, url: row.url ? { text: "Abrir vaga", hyperlink: row.url } : "" });
    added.alignment = { vertical: "top", wrapText: true };
    const link = added.getCell("url");
    if (row.url) link.font = { color: { argb: "FF0B57D0" }, underline: true };
    added.getCell("status").dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${statuses.join(",")}"`],
      showErrorMessage: false,
    };
  }
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
  header.alignment = { vertical: "middle", wrapText: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: TRACKER_COLUMNS.length } };
  const help = workbook.addWorksheet("Como usar");
  help.getColumn(1).width = 100;
  for (const line of [
    "Como usar esta planilha",
    "",
    "• Na coluna Status, escolha em que pé está cada vaga (a lista aparece ao clicar na célula).",
    "• Use a coluna Anotações para o que quiser lembrar (contato, data da entrevista...).",
    "• Na próxima busca o Pathfinder mantém o Status e as Anotações e acrescenta as vagas novas.",
    "• Feche a planilha antes de pedir uma nova busca, para que ela possa ser atualizada.",
    "• Não altere a coluna Código: é como o Pathfinder reconhece cada vaga.",
  ]) help.addRow([line]);
  help.getRow(1).font = { bold: true, size: 13 };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
