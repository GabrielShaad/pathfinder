import { describe, expect, it } from "vitest";
import {
  assessEligibility,
  detectLanguage,
  extractNumbers,
  isBrazilJob,
  keywordCoverage,
  levelRank,
  lintProfile,
  matchers,
  prescore,
  titleMatch,
  unsupportedNumbers,
  verifyResume,
  type JobPosting,
} from "../src/core/index.js";
import { prefs, profile, resumeDoc } from "./helpers.js";

const job = (overrides: Partial<JobPosting>): JobPosting => ({
  id: "test:1",
  source: "greenhouse",
  company: "Acme",
  title: "Analista de Marketing",
  url: "https://example.com/job",
  locationText: "",
  workplace: "remote",
  regions: [],
  timezones: [],
  tags: [],
  description: "",
  ...overrides,
});

describe("numbers", () => {
  it("reads pt-BR and en formats both ways", () => {
    expect(extractNumbers("45.000 contatos")).toContain(45000);
    expect(extractNumbers("27,5%")).toContain(27.5);
    expect(extractNumbers("45,000 contacts")).toContain(45000);
    expect(extractNumbers("27.5%")).toContain(27.5);
    expect(extractNumbers("200k users")).toContain(200000);
    expect(extractNumbers("1,2 mil")).toContain(1200);
  });

  it("accepts a translated number and rejects an inflated one", () => {
    const facts = ["Liderou a migração com 45.000 contatos e taxa de 27,5%."];
    expect(unsupportedNumbers("Migrated 45,000 contacts; open rate 27.5%", facts)).toEqual([]);
    expect(unsupportedNumbers("Migrated 50,000 contacts", facts)).toEqual(["50,000"]);
  });

  it("ignores digits glued to words", () => {
    expect(extractNumbers("GA4 and Qwen3")).toEqual([]);
  });
});

describe("verifyResume", () => {
  it("passes the fixture resume", () => {
    expect(verifyResume(profile(), resumeDoc()).filter((issue) => issue.level === "error")).toEqual([]);
  });

  it("catches unknown facts, foreign facts, invented skills and a familiar skill in the summary", () => {
    const doc = resumeDoc();
    doc.experience[0]!.bullets.push({ text: "Gerenciou 3 pessoas.", fact_ids: ["nao-existe"] });
    doc.experience[1]!.bullets.push({ text: "Criou fluxos.", fact_ids: ["alfa-nurturing"] });
    doc.skills[0]!.items.push("SEO");
    doc.summary.text += " Usa SQL.";
    const messages = verifyResume(profile(), doc).map((issue) => `${issue.where}: ${issue.message}`).join("\n");
    expect(messages).toContain('unknown fact id "nao-existe"');
    expect(messages).toContain('belongs to role "escola-alfa"');
    expect(messages).toContain('"SEO" is not in the profile');
    expect(messages).toContain("working knowledge only");
  });

  it("requires the current role", () => {
    const doc = resumeDoc();
    doc.experience = doc.experience.filter((entry) => entry.role_id !== "escola-alfa");
    expect(verifyResume(profile(), doc).some((issue) => issue.message.includes("current role"))).toBe(true);
  });
});

describe("profile lint and keyword coverage", () => {
  it("lints a clean profile without errors", () => {
    expect(lintProfile(profile()).filter((issue) => issue.level === "error")).toEqual([]);
  });

  it("flags roles out of order", () => {
    const p = profile();
    p.roles.reverse();
    expect(lintProfile(p).some((issue) => issue.where === "roles")).toBe(true);
  });

  it("matches keywords through aliases and accents", () => {
    const coverage = keywordCoverage("Experiência com email marketing e GA4", ["E-mail marketing", "Google Analytics", "SEO"], profile());
    expect(coverage.keywords.map((k) => k.status)).toEqual(["covered", "covered", "gap"]);
  });
});

describe("titles", () => {
  const p = prefs();
  it("matches target titles across gender, plural, accents and seniority words", () => {
    expect(titleMatch("ANALISTA DE MARKETING PLENO", p).level).toBe("target");
    expect(titleMatch("Analistas de Marketing Digital", p).level).toBe("target");
    expect(titleMatch("Sr. Marketing Analyst", p).level).toBe("target");
    expect(titleMatch("Especialista em CRM", p).level).toBe("keyword");
    expect(titleMatch("Desenvolvedor Back-end", p).level).toBe("none");
  });
});

describe("eligibility", () => {
  const base = { languages: profile().languages, basics: profile().basics };

  it("national: remote Gupy job is eligible, on-site in another city is not", () => {
    const national = prefs({ scope: "national" });
    expect(assessEligibility(job({ source: "gupy", brazil: true, workplace: "remote" }), national, base)).toMatchObject({ verdict: "eligible", track: "national" });
    expect(assessEligibility(job({ source: "gupy", brazil: true, workplace: "onsite", locationText: "Presencial · Recife, PE" }), national, base).verdict).toBe("ineligible");
  });

  it("national with hybrid allowed: hybrid in the person's city passes", () => {
    const hybrid = prefs({ scope: "national", workplace: "remote_or_hybrid", city: "São Paulo" });
    expect(assessEligibility(job({ source: "gupy", brazil: true, workplace: "hybrid", locationText: "Híbrido · São Paulo, SP" }), hybrid, base).verdict).toBe("eligible");
  });

  it("global: open to LATAM is eligible, US-only and title countries are not", () => {
    const global = prefs({ scope: "global" });
    expect(assessEligibility(job({ title: "Marketing Analyst", regions: ["LATAM"] }), global, base)).toMatchObject({ verdict: "eligible", track: "global" });
    expect(assessEligibility(job({ title: "Marketing Analyst", locationText: "Remote - US only" }), global, base).verdict).toBe("ineligible");
    expect(assessEligibility(job({ title: "Email Marketing Specialist - Spain", regions: ["Brazil", "Spain"] }), global, base).verdict).toBe("ineligible");
    expect(assessEligibility(job({ source: "gupy", brazil: true }), global, base).verdict).toBe("ineligible");
  });

  it("a remote job open to many countries is international, not national", () => {
    expect(isBrazilJob(job({ regions: ["Brazil", "Mexico", "Chile"] }))).toBe(false);
    expect(isBrazilJob(job({ regions: ["Brazil"] }))).toBe(true);
    expect(isBrazilJob(job({ locationText: "Remote - Brazil" }))).toBe(true);
    expect(isBrazilJob(job({ locationText: "El Salvador" }))).toBe(false);
  });

  it("rejects a required language the person does not speak well enough", () => {
    const basic = { languages: [{ name: "Inglês", level: "Básico", confirmed: true, i18n: {} }], basics: profile().basics };
    const posting = job({ title: "Marketing Analyst", regions: ["LATAM"], description: "We need fluent English and 3 years of CRM." });
    expect(assessEligibility(posting, prefs({ scope: "global" }), basic).reasons[0]).toContain("exige inglês");
    expect(assessEligibility(posting, prefs({ scope: "global" }), base).verdict).toBe("eligible");
    expect(levelRank("C1")).toBe(3);
  });

  it("respects seniority, exclusions, avoided companies and talent pools", () => {
    const senior = prefs({ seniority: "senior", avoid_companies: ["Beta"] });
    expect(assessEligibility(job({ title: "Estagiário de Marketing" }), senior, base).verdict).toBe("ineligible");
    expect(assessEligibility(job({ company: "Loja Beta" }), senior, base).verdict).toBe("ineligible");
    expect(assessEligibility(job({ employmentType: "talent_pool", source: "gupy", brazil: true }), senior, base).verdict).toBe("ineligible");
  });

  it("salary floor converts currencies", () => {
    const floor = prefs({ scope: "global", salary_min: { amount: 8000, currency: "BRL", period: "month" } });
    const cheap = job({ title: "Marketing Analyst", regions: ["LATAM"], salary: { max: 6000, currency: "USD", period: "year" } });
    const fair = job({ title: "Marketing Analyst", regions: ["LATAM"], salary: { max: 30000, currency: "USD", period: "year" } });
    expect(assessEligibility(cheap, floor, base).verdict).toBe("ineligible");
    expect(assessEligibility(fair, floor, base).verdict).toBe("eligible");
  });
});

describe("prescore and language", () => {
  it("ranks a target-title job with matching skills above a keyword-only one", () => {
    const p = prefs();
    const m = matchers(profile(), p);
    const strong = prescore(job({ title: "Analista de CRM", description: "HubSpot, e-mail marketing e automação de marketing" }), m, p);
    const weak = prescore(job({ title: "Coordenador de Marketing", description: "Eventos" }), m, p);
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.matched).toEqual(expect.arrayContaining(["HubSpot", "E-mail marketing"]));
  });

  it("detects the posting language", () => {
    expect(detectLanguage("Estamos buscando uma pessoa para a vaga de analista. Você vai trabalhar com o nosso time de marketing, com experiência em CRM e também em automação para a empresa.")).toBe("pt");
    expect(detectLanguage("We are looking for a marketing analyst to join our team. You will work with the growth team and have experience with CRM and automation for the business.")).toBe("en");
    expect(detectLanguage("short")).toBe("unknown");
  });
});
