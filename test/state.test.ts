import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { readTrackerEdits, renderTracker } from "../src/render/jobs-xlsx.js";
import { cleanPath } from "../src/server/tools.js";
import { STATUS_LABEL, STATUSES, statusFromLabel } from "../src/state/store.js";
import { defaultRoot, isInside, safeFileName } from "../src/state/workspace.js";
import { outDir } from "./helpers.js";

describe("workspace", () => {
  it("uses Documents/Pathfinder and honours the override", () => {
    expect(defaultRoot({}, "darwin", "/Users/ana")).toMatch(/Pathfinder$/);
    expect(defaultRoot({ PATHFINDER_HOME: "/tmp/minha-pasta" }, "darwin", "/Users/ana")).toBe(resolve("/tmp/minha-pasta"));
    // An unfilled plugin option arrives as a literal placeholder.
    expect(defaultRoot({ PATHFINDER_HOME: "${user_config.pasta}" }, "linux", "/home/ana")).toMatch(/Pathfinder$/);
  });

  it("keeps files inside the folder", () => {
    expect(isInside("/a/Pathfinder", "/a/Pathfinder/Vagas/x.pdf")).toBe(true);
    expect(isInside("/a/Pathfinder", "/a/Pathfinder-evil/x.pdf")).toBe(false);
    expect(isInside("/a/Pathfinder", "/a/Pathfinder/../x.pdf")).toBe(false);
  });

  it("makes file names safe on every OS", () => {
    expect(safeFileName('2026-11-02 Acme: "CRM" / Analista?')).toBe("2026-11-02 Acme CRM Analista");
  });

  it("cleans dragged-in paths", () => {
    if (process.platform !== "win32") expect(cleanPath("'/Users/ana/Meu\\ CV.pdf'")).toBe("/Users/ana/Meu\\ CV.pdf".replace("\\ ", " "));
    expect(cleanPath('"/tmp/cv.pdf"')).toMatch(/cv\.pdf$/);
  });
});

describe("tracker spreadsheet", () => {
  it("round-trips the status and notes the person typed", async () => {
    const path = join(outDir(), "tracker.xlsx");
    const labels = STATUSES.map((status) => STATUS_LABEL[status]);
    writeFileSync(path, await renderTracker([{ ref: "abc123", status: "Nova", title: "Analista", company: "Acme", location: "Remoto", url: "https://x", source: "Gupy", found: "02/11/2026" }], labels));

    // The person edits the file in Excel.
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path);
    const sheet = workbook.worksheets[0]!;
    sheet.getRow(2).getCell(2).value = "Entrevista";
    sheet.getRow(2).getCell(15).value = "Falar com a Ana na quinta";
    await workbook.xlsx.writeFile(path);

    const edits = await readTrackerEdits(path);
    expect(edits.get("abc123")).toEqual({ status: "Entrevista", notes: "Falar com a Ana na quinta" });
    expect(statusFromLabel("Entrevista")).toBe("interview");
    expect(readFileSync(path).subarray(0, 2).toString()).toBe("PK");
  });
});
