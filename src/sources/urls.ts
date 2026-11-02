import type { Ats } from "./ats.js";

// Maps a job or careers URL on a known ATS to the company's public board token
// (ported from Horizon's firecrawl.ts). Used for companies found by web search.

export interface AtsLink {
  ats: Ats;
  token: string;
}

const ATS_HOSTS: { pattern: RegExp; ats: Ats }[] = [
  { pattern: /^https?:\/\/(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([\w-]+)/i, ats: "greenhouse" },
  { pattern: /^https?:\/\/jobs(?:\.eu)?\.lever\.co\/([\w-]+)/i, ats: "lever" },
  { pattern: /^https?:\/\/jobs\.ashbyhq\.com\/([\w.-]+)/i, ats: "ashby" },
  { pattern: /^https?:\/\/(?:jobs|careers)\.smartrecruiters\.com\/([\w-]+)/i, ats: "smartrecruiters" },
  { pattern: /^https?:\/\/apply\.workable\.com\/([\w-]+)/i, ats: "workable" },
  { pattern: /^https?:\/\/([\w-]+)\.recruitee\.com/i, ats: "recruitee" },
];

const NOT_TOKENS = new Set(["embed", "api", "v1", "jobs", "careers", "www", "j", "o"]);

export function atsLink(url: string): AtsLink | undefined {
  for (const { pattern, ats } of ATS_HOSTS) {
    const token = url.trim().match(pattern)?.[1];
    if (token && !NOT_TOKENS.has(token.toLowerCase())) return { ats, token };
  }
  return undefined;
}

export function atsLinks(urls: string[]): AtsLink[] {
  const seen = new Map<string, AtsLink>();
  for (const url of urls) {
    const link = atsLink(url);
    if (link) seen.set(`${link.ats}:${link.token}`, link);
  }
  return [...seen.values()];
}
