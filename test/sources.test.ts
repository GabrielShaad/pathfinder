import { describe, expect, it } from "vitest";
import { dedupe } from "../src/core/index.js";
import {
  atsLink,
  parseAshby,
  parseGreenhouse,
  parseGupyPage,
  parseHimalayas,
  parseJobicy,
  parseLever,
  parseRemoteOk,
  parseWeWorkRemotely,
  planSearch,
} from "../src/sources/index.js";
import { fixture, json, prefs } from "./helpers.js";

// Fixtures are trimmed copies of real responses (ATS and boards recorded 2026-10-28 in
// Horizon; Gupy and Jobicy recorded 2026-11-02).

describe("ATS parsers", () => {
  it("greenhouse: decodes double-escaped HTML and reads the location", () => {
    const [job] = parseGreenhouse(json("greenhouse.json"), { name: "GitLab", ats: "greenhouse", token: "gitlab" });
    expect(job?.id).toMatch(/^greenhouse:gitlab:\d+$/);
    expect(job?.workplace).toBe("remote");
    expect(job?.description).not.toMatch(/&lt;|<div/);
  });

  it("lever: joins all locations and the country", () => {
    const [job] = parseLever(json("lever.json"), { name: "Oowlish", ats: "lever", token: "oowlish" });
    expect(job?.locationText).toContain("Brazil");
  });

  it("ashby: uses isRemote", () => {
    const [job] = parseAshby(json("ashby.json"), { name: "PostHog", ats: "ashby", token: "posthog" });
    expect(job?.workplace).toBe("remote");
  });
});

describe("board parsers", () => {
  it("gupy: reads the embedded search JSON", () => {
    const { jobs, total } = parseGupyPage(fixture("gupy.html"));
    expect(jobs.length).toBe(2);
    expect(total).toBeGreaterThan(0);
    expect(jobs[0]).toMatchObject({ source: "gupy", workplace: "remote", brazil: true, employmentType: "CLT" });
    expect(jobs[0]!.company).not.toContain("venha fazer parte");
    expect(jobs[0]!.url).toMatch(/^https:\/\/.+\.gupy\.io\/job\//);
    expect(jobs[0]!.description.length).toBeGreaterThan(100);
  });

  it("gupy: a page without the JSON yields nothing instead of throwing", () => {
    expect(parseGupyPage("<html>maintenance</html>").jobs).toEqual([]);
  });

  it("jobicy: splits the regions and strips HTML", () => {
    const [job] = parseJobicy(json("jobicy.json"));
    expect(job?.id).toMatch(/^jobicy:\d+$/);
    expect(job?.regions.length).toBeGreaterThan(0);
    expect(job?.description).not.toMatch(/<p>/);
  });

  it("himalayas, remote ok, we work remotely", () => {
    expect(parseHimalayas(json("himalayas.json"))[0]?.regions).toEqual(["United States"]);
    expect(parseRemoteOk(json("remoteok.json"))).toHaveLength(2);
    expect(parseWeWorkRemotely(fixture("wwr.rss"))[0]).toMatchObject({ company: "StockX", regions: ["Worldwide"] });
  });
});

describe("search plan and helpers", () => {
  it("queries Gupy only for national searches and boards only for global ones", () => {
    const national = planSearch(prefs({ scope: "national" }), []).map((step) => step.source);
    const global = planSearch(prefs({ scope: "global" }), []).map((step) => step.source);
    expect(national).toEqual(["gupy"]);
    expect(global).toEqual(expect.arrayContaining(["himalayas", "jobicy", "weworkremotely", "remotive"]));
    expect(global).not.toContain("gupy");
  });

  it("maps ATS URLs to board tokens", () => {
    expect(atsLink("https://jobs.lever.co/oowlish/123")).toEqual({ ats: "lever", token: "oowlish" });
    expect(atsLink("https://boards.greenhouse.io/gitlab/jobs/1")).toEqual({ ats: "greenhouse", token: "gitlab" });
    expect(atsLink("https://example.com/careers")).toBeUndefined();
  });

  it("dedupes by company and title, preferring the ATS copy", () => {
    const base = { url: "", locationText: "", workplace: "remote" as const, regions: [], timezones: [], tags: [], description: "" };
    const kept = dedupe([
      { ...base, id: "remotive:1", source: "remotive", company: "Acme Inc", title: "Analista de CRM" },
      { ...base, id: "lever:acme:1", source: "lever", company: "Acme", title: "Analista de CRM" },
    ]);
    expect(kept.map((job) => job.source)).toEqual(["lever"]);
  });
});

describe("dedupe across boards", () => {
  it("treats 'Grupo X Brasil' and 'X Brasil' as the same employer", () => {
    const base = { url: "", locationText: "", workplace: "remote" as const, regions: [], timezones: [], tags: [], description: "" };
    const kept = dedupe([
      { ...base, id: "himalayas:1", source: "himalayas", company: "Henry Schein Brasil", title: "Analista de CRM" },
      { ...base, id: "gupy:1", source: "gupy", company: "Grupo Henry Schein Brasil", title: "Analista de CRM" },
    ]);
    expect(kept.map((job) => job.source)).toEqual(["gupy"]);
  });
});
