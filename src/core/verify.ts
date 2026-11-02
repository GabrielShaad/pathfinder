import { FAMILIAR_LABELS } from "./i18n.js";
import { escapeRegExp } from "./keywords.js";
import { unsupportedNumbers } from "./numbers.js";
import { findSkill, indexFacts, type Profile } from "./profile.js";
import type { Bullet, ResumeDoc } from "./resume.js";

export interface Issue {
  level: "error" | "warning";
  where: string;
  message: string;
}

const PLACEHOLDER = /\[|\]|\bTODO\b|\bTBD\b|\bXX+\b/;
const MAX_BULLET_CHARS = 260;
const MAX_SUMMARY_CHARS = 650;
const MAX_BULLETS_PER_ROLE = 6;

const isFamiliarGroup = (category: string) => FAMILIAR_LABELS.has(category.trim().toLowerCase());

// Deterministic guardrails (ported from Horizon's verifyTailored). Semantic drift
// (a responsibility rephrased as an outcome, an inflated verb, a loose translation)
// is left to the reviewer agent, which reads this report first.
export function verifyResume(profile: Profile, doc: ResumeDoc): Issue[] {
  const issues: Issue[] = [];
  const facts = indexFacts(profile);
  const error = (where: string, message: string) => issues.push({ level: "error", where, message });
  const warn = (where: string, message: string) => issues.push({ level: "warning", where, message });

  const checkBullet = (where: string, bullet: Bullet, owner?: { kind: "role" | "project"; id: string }, maxChars = MAX_BULLET_CHARS) => {
    const sources: string[] = profile.basics.years_experience !== undefined ? [String(profile.basics.years_experience)] : [];
    for (const id of bullet.fact_ids) {
      const ref = facts.get(id);
      if (!ref) {
        error(where, `unknown fact id "${id}"`);
        continue;
      }
      if (!ref.fact.confirmed) error(where, `fact "${id}" is not confirmed yet`);
      if (owner && (ref.owner.kind !== owner.kind || ref.owner.id !== owner.id)) {
        error(where, `fact "${id}" belongs to ${ref.owner.kind} "${"id" in ref.owner ? ref.owner.id : "career"}", not ${owner.kind} "${owner.id}"`);
      }
      sources.push(ref.fact.text, ...ref.fact.metrics);
    }
    const invented = unsupportedNumbers(bullet.text, sources);
    if (invented.length > 0) error(where, `numbers not found in the cited facts: ${invented.join(", ")}`);
    if (PLACEHOLDER.test(bullet.text)) error(where, "contains a placeholder");
    if (bullet.text.length > maxChars) warn(where, `${bullet.text.length} chars (max ${maxChars})`);
  };

  const headline = profile.basics.headlines[doc.language];
  if (headline !== undefined && headline !== doc.headline) {
    warn("headline", `differs from the profile's ${doc.language} headline: check every term is backed by experience`);
  }
  if (PLACEHOLDER.test(doc.headline)) error("headline", "contains a placeholder");
  checkBullet("summary", doc.summary, undefined, MAX_SUMMARY_CHARS);

  for (const group of doc.skills) {
    for (const item of group.items) {
      const skill = findSkill(profile, item);
      if (!skill) error(`skills/${group.category}`, `"${item}" is not in the profile (add it as a name or alias only if the person confirmed it)`);
      else if (!skill.confirmed) error(`skills/${group.category}`, `"${item}" is not confirmed yet`);
      else if (skill.level === "familiar" && !isFamiliarGroup(group.category)) {
        error(`skills/${group.category}`, `"${item}" is working knowledge: list it in the working-knowledge group`);
      }
    }
  }

  for (const skill of profile.skills.filter((s) => s.level === "familiar")) {
    const terms = [skill.name, ...skill.aliases].filter((term) => term.trim().length > 1);
    if (terms.length === 0) continue;
    const pattern = new RegExp(`(?<![\\p{L}\\d])(${terms.map(escapeRegExp).join("|")})(?![\\p{L}\\d])`, "iu");
    for (const [where, text] of [["headline", doc.headline], ["summary", doc.summary.text]] as const) {
      if (pattern.test(text)) error(where, `mentions "${skill.name}", which is working knowledge only`);
    }
  }

  const roleIds = new Set(profile.roles.map((role) => role.id));
  const seen = new Set<string>();
  for (const entry of doc.experience) {
    const where = `experience/${entry.role_id}`;
    if (!roleIds.has(entry.role_id)) error(where, "unknown role id");
    if (seen.has(entry.role_id)) error(where, "role listed twice");
    seen.add(entry.role_id);
    if (entry.bullets.length > MAX_BULLETS_PER_ROLE) warn(where, `${entry.bullets.length} bullets (max ${MAX_BULLETS_PER_ROLE})`);
    entry.bullets.forEach((bullet, i) => checkBullet(`${where}[${i}]`, bullet, { kind: "role", id: entry.role_id }));
  }
  for (const id of doc.earlier_role_ids) {
    if (!roleIds.has(id)) error(`earlier/${id}`, "unknown role id");
    if (seen.has(id)) error(`earlier/${id}`, "role is both in experience and earlier experience");
    seen.add(id);
  }
  // Leaving out the current job reads as a gap.
  for (const role of profile.roles.filter((r) => r.end === null)) {
    if (!doc.experience.some((entry) => entry.role_id === role.id)) error(`experience/${role.id}`, "the current role must always be included");
  }
  const omitted = profile.roles.filter((role) => !seen.has(role.id));
  if (omitted.length > 0) warn("experience", `roles omitted entirely (creates gaps): ${omitted.map((r) => r.id).join(", ")}`);

  const projectIds = new Set(profile.projects.map((project) => project.id));
  for (const entry of doc.projects) {
    const where = `projects/${entry.project_id}`;
    if (!projectIds.has(entry.project_id)) error(where, "unknown project id");
    entry.bullets.forEach((bullet, i) => checkBullet(`${where}[${i}]`, bullet, { kind: "project", id: entry.project_id }));
  }

  for (const id of doc.education_ids) {
    const education = profile.education.find((e) => e.id === id);
    if (!education) error(`education/${id}`, "unknown education id");
    else if (!education.confirmed) error(`education/${id}`, "education entry is not confirmed yet");
  }

  return issues;
}
