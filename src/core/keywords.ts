import { findSkill, fold, type Profile } from "./profile.js";

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Word-ish boundaries that still work for "Node.js", "C#", "CI/CD" and accented words.
export function mentions(text: string, term: string): boolean {
  if (!term.trim()) return false;
  return new RegExp(`(?<![\\p{L}\\d])${escapeRegExp(fold(term))}(?![\\p{L}\\d])`, "iu").test(fold(text));
}

export interface KeywordResult {
  keyword: string;
  // covered: in the resume text; available: not in the text but backed by a confirmed
  // skill; unconfirmed: waiting for the person to confirm; gap: no evidence at all.
  status: "covered" | "available" | "unconfirmed" | "gap";
}

export interface Coverage {
  keywords: KeywordResult[];
  score: number;
}

function classify(text: string, keyword: string, profile: Profile): KeywordResult["status"] {
  const skill = findSkill(profile, keyword);
  const terms = skill ? [keyword, skill.name, ...skill.aliases] : [keyword];
  if (terms.some((term) => mentions(text, term))) return "covered";
  if (!skill) return "gap";
  return skill.confirmed ? "available" : "unconfirmed";
}

// How many of the market's recurring requirements the resume text shows.
export function keywordCoverage(text: string, keywords: string[], profile: Profile): Coverage {
  const results = keywords.map((keyword) => ({ keyword, status: classify(text, keyword, profile) }));
  const covered = results.filter((result) => result.status === "covered").length;
  return { keywords: results, score: results.length === 0 ? 1 : covered / results.length };
}
