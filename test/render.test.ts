import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveResume, verifyResume } from "../src/core/index.js";
import { checkPdf, pdfText } from "../src/render/ats-check.js";
import { renderResumeDocx } from "../src/render/resume-docx.js";
import { renderResumePdf } from "../src/render/resume-pdf.js";
import { outDir, profile, resumeDoc } from "./helpers.js";

describe("resume rendering", () => {
  it("renders a Portuguese PDF that passes the ATS read-back", async () => {
    const p = profile();
    const doc = resumeDoc();
    expect(verifyResume(p, doc).filter((issue) => issue.level === "error")).toEqual([]);
    const resolved = resolveResume(p, doc);
    const pdf = await renderResumePdf(resolved);
    writeFileSync(join(outDir(), "curriculo-pt.pdf"), pdf);
    const report = await checkPdf(pdf, resolved);
    expect(report.issues).toEqual([]);
    expect(report.pages).toBe(1);
    expect(report.text).toContain("EXPERIÊNCIA PROFISSIONAL");
    expect(report.text).toContain("03/2022 – Atual");
    // Ligatures off: "fluxos", "fi" stay plain letters.
    expect(report.text).not.toMatch(/[ﬀ-ﬆ]/);
  });

  it("renders the English version with translated titles and labels", async () => {
    const p = profile();
    const doc = { ...resumeDoc(), language: "en" as const, headline: "Digital Marketing Analyst | CRM and Marketing Automation", skills: [{ category: "Marketing", items: ["CRM", "Email marketing", "Marketing automation"] }, { category: "Working knowledge", items: ["SQL"] }] };
    expect(verifyResume(p, doc).filter((issue) => issue.level === "error")).toEqual([]);
    const resolved = resolveResume(p, doc);
    expect(resolved.experience[0]).toMatchObject({ title: "Marketing Analyst", dates: "Mar 2022 – Present" });
    const pdf = await renderResumePdf(resolved);
    writeFileSync(join(outDir(), "resume-en.pdf"), pdf);
    const report = await checkPdf(pdf, resolved);
    expect(report.issues).toEqual([]);
    const { text } = await pdfText(pdf);
    expect(text).toContain("EXPERIENCE");
  });

  it("renders a DOCX", async () => {
    const docx = await renderResumeDocx(resolveResume(profile(), resumeDoc()));
    writeFileSync(join(outDir(), "curriculo-pt.docx"), docx);
    expect(docx.subarray(0, 2).toString()).toBe("PK");
  });
});
