import { indexFacts, type Profile } from "./profile.js";
import type { Issue } from "./verify.js";

const months = (value: string) => {
  const [year = 0, month = 0] = value.split("-").map(Number);
  return year * 12 + month;
};

// What the person still has to answer, plus red flags a recruiter's skim would catch.
export function lintProfile(profile: Profile, today = new Date()): Issue[] {
  const issues: Issue[] = [];
  const add = (level: Issue["level"], where: string, message: string) => issues.push({ level, where, message });

  try {
    indexFacts(profile);
  } catch (error) {
    add("error", "facts", (error as Error).message);
  }

  for (const owner of [...profile.roles, ...profile.projects]) {
    for (const fact of owner.facts) {
      if (!fact.confirmed) add("warning", `to-confirm/${fact.id}`, fact.text);
      if (fact.note) add("warning", `note/${fact.id}`, fact.note);
    }
  }
  for (const role of profile.roles) {
    if (role.facts.length === 0) add("warning", `role/${role.id}`, "no facts yet: the resume will show only the title and dates");
    if (role.end && months(role.end) < months(role.start)) add("error", `role/${role.id}`, "end date before start date");
  }
  for (const education of profile.education) if (education.note) add("warning", `note/${education.id}`, education.note);
  for (const language of profile.languages) if (!language.confirmed) add("warning", "to-confirm/language", `${language.name}: level`);
  const pending = profile.skills.filter((skill) => !skill.confirmed).map((skill) => skill.name);
  if (pending.length > 0) add("warning", "to-confirm/skills", pending.join(", "));

  const now = today.getFullYear() * 12 + today.getMonth() + 1;
  const fullTime = profile.roles.filter((role) => role.employment_type === "full-time");
  for (let i = 0; i < fullTime.length; i++) {
    for (let j = i + 1; j < fullTime.length; j++) {
      const a = fullTime[i]!;
      const b = fullTime[j]!;
      // Inclusive month count; one shared month is a normal handover.
      const overlap = Math.min(a.end ? months(a.end) : now, b.end ? months(b.end) : now) - Math.max(months(a.start), months(b.start)) + 1;
      if (overlap >= 2) add("warning", `overlap/${a.id}+${b.id}`, `full-time roles overlap by ${overlap} month(s): mark one as part-time/freelance/contract or fix the dates`);
    }
  }
  const ordered = profile.roles.every((role, i, all) => i === 0 || months(all[i - 1]!.start) >= months(role.start));
  if (!ordered) add("error", "roles", "roles must be in reverse-chronological order of start date (newest first)");
  return issues;
}
