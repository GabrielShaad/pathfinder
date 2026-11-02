import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import {
  assessEligibility,
  dedupe,
  detectLanguage,
  keywordCoverage,
  lintProfile,
  matchers,
  prescore,
  resolveResume,
  resumeLanguages,
  resumeText,
  ResumeDocSchema,
  SOURCE_LABEL,
  verifyResume,
  type JobPosting,
  type Lang,
  type Preferences,
  type PreferencesInput,
  type Profile,
  type ProfileInput,
  type ResumeDocInput,
  type SourceName,
} from "../core/index.js";
import { checkPdf } from "../render/ats-check.js";
import { diagnoseResume, extractResumeText, RESUME_EXTENSIONS } from "../render/extract.js";
import { renderJobListPdf, VERDICT_LABEL, type JobCard } from "../render/jobs-pdf.js";
import { readTrackerEdits, renderTracker, type TrackerRow } from "../render/jobs-xlsx.js";
import { renderLetterDocx, renderLetterPdf } from "../render/letter.js";
import { renderResumeDocx } from "../render/resume-docx.js";
import { renderResumePdf } from "../render/resume-pdf.js";
import { atsLinks, fetchCompanies, planSearch, runSearch, type SourceRun } from "../sources/index.js";
import {
  addCompanies,
  findJob,
  formatSalary,
  loadCompanies,
  loadJobs,
  loadPreferences,
  loadProfile,
  refOf,
  saveJobs,
  savePreferences,
  saveProfile,
  STATUS_LABEL,
  STATUSES,
  statusFromLabel,
  type JobsState,
  type Status,
  type TrackedJob,
} from "../state/store.js";
import { ensureWorkspace, isInside, safeFileName, workspace, writeAtomic, type Workspace } from "../state/workspace.js";
import { openWithSystem } from "./opener.js";
import pkg from "../../package.json" with { type: "json" };

// Tool implementations, independent of MCP so tests can call them directly.
// Every path they write is inside the Pathfinder folder.

export const REQUIRED_NODE_MAJOR = 22;
export const PLUGIN_VERSION: string = pkg.version;
const MAX_RESUME_BYTES = 15 * 1024 * 1024;
const SCORE_BATCH = 30;

export class ToolError extends Error {}

export interface Context {
  ws: Workspace;
  now: () => Date;
}

export const defaultContext = (): Context => ({ ws: workspace(), now: () => new Date() });

const stamp = (date: Date) => date.toISOString().slice(0, 16).replace(":", "-");
const day = (date: Date) => date.toISOString().slice(0, 10);
const ptDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : undefined);

function requireProfile(ctx: Context): Profile {
  const profile = loadProfile(ctx.ws);
  if (!profile) throw new ToolError("No profile yet. Run the interview first (/pathfinder:comecar).");
  return profile;
}

function requirePreferences(ctx: Context): Preferences {
  const prefs = loadPreferences(ctx.ws);
  if (!prefs) throw new ToolError("No search preferences yet. Finish the interview first (/pathfinder:comecar).");
  return prefs;
}

// --- setup_status ------------------------------------------------------------------

export function setupStatus(ctx: Context) {
  ensureWorkspace(ctx.ws);
  const major = Number(process.versions.node.split(".")[0]);
  const profile = (() => {
    try {
      return loadProfile(ctx.ws);
    } catch (error) {
      return { error: (error as Error).message };
    }
  })();
  const searches = existsSync(ctx.ws.searchesDir) ? readdirSync(ctx.ws.searchesDir).filter((f) => f.endsWith(".json")).sort() : [];
  const resumes = existsSync(ctx.ws.resumeDir) ? readdirSync(ctx.ws.resumeDir).filter((f) => /\.(pdf|docx)$/i.test(f)) : [];
  return {
    plugin_version: PLUGIN_VERSION,
    node_version: process.versions.node,
    node_ok: major >= REQUIRED_NODE_MAJOR,
    platform: process.platform,
    workspace: ctx.ws.root,
    has_profile: Boolean(profile && !("error" in profile)),
    profile_error: profile && "error" in profile ? profile.error : undefined,
    has_preferences: existsSync(ctx.ws.preferences),
    resume_files: resumes.map((file) => join(ctx.ws.resumeDir, file)),
    last_search: searches.at(-1)?.replace(/\.json$/, ""),
    tracked_jobs: Object.keys(loadJobs(ctx.ws).jobs).length,
  };
}

// --- import_resume -------------------------------------------------------------------

export function cleanPath(input: string): string {
  let path = input.trim().replace(/^file:\/\//, "");
  if ((path.startsWith('"') && path.endsWith('"')) || (path.startsWith("'") && path.endsWith("'"))) path = path.slice(1, -1);
  // Terminals escape spaces when a file is dragged in ("My\ CV.pdf").
  if (process.platform !== "win32") path = path.replace(/\\([ ()&'\[\]])/g, "$1");
  if (path.startsWith("~")) path = join(homedir(), path.slice(1));
  if (/%[0-9a-f]{2}/i.test(path)) {
    try {
      path = decodeURIComponent(path);
    } catch {
      // A literal "%" in the name.
    }
  }
  return resolve(path);
}

// The newest resume-like file the person dropped straight into the Pathfinder folder.
function droppedResume(ctx: Context): string | undefined {
  const files = readdirSync(ctx.ws.root)
    .filter((file) => (RESUME_EXTENSIONS as readonly string[]).includes(extname(file).toLowerCase()) && file !== basename(ctx.ws.readme))
    .map((file) => join(ctx.ws.root, file))
    .filter((file) => statSync(file).isFile());
  return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

export async function importResume(ctx: Context, input: { path?: string; text?: string }) {
  ensureWorkspace(ctx.ws);
  if (input.text?.trim()) {
    const target = join(ctx.ws.originalDir, `colado-${stamp(ctx.now())}.txt`);
    writeAtomic(target, input.text);
    return { saved_copy: target, text: input.text.slice(0, 40_000), diagnosis: diagnoseResume(input.text) };
  }
  const given = input.path?.trim() ? input.path : droppedResume(ctx);
  if (!given) throw new ToolError(`No file given and none found in ${ctx.ws.root}. Ask the person to attach the file, drag it into the terminal, or save it in that folder.`);
  const path = cleanPath(given);
  const extension = extname(path).toLowerCase();
  if (!(RESUME_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new ToolError(`Unsupported file type "${extension || "none"}". Accepted: ${RESUME_EXTENSIONS.join(", ")}. For an old .doc, ask the person to save it as PDF or DOCX.`);
  }
  if (!existsSync(path) || !statSync(path).isFile()) throw new ToolError(`File not found: ${path}`);
  if (statSync(path).size > MAX_RESUME_BYTES) throw new ToolError("File is larger than 15 MB; that is not a resume.");
  const target = join(ctx.ws.originalDir, `${stamp(ctx.now())}-${safeFileName(basename(path), 60)}`);
  copyFileSync(path, target);
  const { text, pages } = await extractResumeText(new Uint8Array(readFileSync(path)), extension);
  const diagnosis = diagnoseResume(text, pages);
  return {
    saved_copy: target,
    text: text.slice(0, 40_000),
    diagnosis,
    hint: diagnosis.hasText ? undefined : `No readable text layer (scanned or image PDF). Read the copy at ${target} with the Read tool to see it, and tell the person their current file cannot be read by an ATS.`,
  };
}

// --- profile and preferences ---------------------------------------------------------------

export function getProfile(ctx: Context) {
  const profile = loadProfile(ctx.ws);
  const preferences = loadPreferences(ctx.ws);
  return { profile: profile ?? null, preferences: preferences ?? null, issues: profile ? lintProfile(profile, ctx.now()) : [] };
}

export function saveProfileTool(ctx: Context, input: ProfileInput) {
  ensureWorkspace(ctx.ws);
  const profile = saveProfile(ctx.ws, input);
  return { saved: ctx.ws.profile, issues: lintProfile(profile, ctx.now()), roles: profile.roles.length, skills: profile.skills.length };
}

export function savePreferencesTool(ctx: Context, input: PreferencesInput) {
  ensureWorkspace(ctx.ws);
  const prefs = savePreferences(ctx.ws, input);
  return { saved: ctx.ws.preferences, resume_languages: resumeLanguages(prefs) };
}

// --- build_resume -----------------------------------------------------------------------------

export async function buildResume(ctx: Context, input: ResumeDocInput) {
  ensureWorkspace(ctx.ws);
  const profile = requireProfile(ctx);
  const prefs = loadPreferences(ctx.ws);
  const doc = ResumeDocSchema.parse({ paper: prefs?.documents.paper, ...input });
  const issues = verifyResume(profile, doc);
  const errors = issues.filter((issue) => issue.level === "error");
  if (errors.length > 0) return { ok: false, errors, warnings: issues.filter((issue) => issue.level === "warning"), files: [] };

  const resolved = resolveResume(profile, doc);
  const pdf = await renderResumePdf(resolved);
  const docx = await renderResumeDocx(resolved);
  const ats = await checkPdf(pdf, resolved);
  const base = join(ctx.ws.resumeDir, safeFileName(`${resolved.labels.resumeFile} - ${profile.basics.name}`));
  writeAtomic(`${base}.pdf`, pdf);
  writeAtomic(`${base}.docx`, docx);
  writeAtomic(join(ctx.ws.dataDir, `curriculo-${doc.language}.json`), JSON.stringify(doc, null, 1));
  const coverage = prefs?.market_keywords.length ? keywordCoverage(resumeText(resolved), prefs.market_keywords, profile) : undefined;
  return {
    ok: ats.issues.every((issue) => issue.level !== "error"),
    errors: ats.issues.filter((issue) => issue.level === "error"),
    warnings: [...issues.filter((issue) => issue.level === "warning"), ...ats.issues.filter((issue) => issue.level === "warning")],
    pages: ats.pages,
    files: [`${base}.pdf`, `${base}.docx`],
    market_keywords: coverage && {
      covered: coverage.keywords.filter((k) => k.status === "covered").map((k) => k.keyword),
      in_profile_not_used: coverage.keywords.filter((k) => k.status === "available").map((k) => k.keyword),
      missing: coverage.keywords.filter((k) => k.status === "gap" || k.status === "unconfirmed").map((k) => k.keyword),
    },
  };
}

export function getResume(ctx: Context, input: { language: Lang }) {
  const path = join(ctx.ws.dataDir, `curriculo-${input.language}.json`);
  if (!existsSync(path)) throw new ToolError(`No ${input.language} resume built yet.`);
  const profile = requireProfile(ctx);
  const doc = ResumeDocSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  return {
    resume: doc,
    text: resumeText(resolveResume(profile, doc)),
    issues: verifyResume(profile, doc),
    note: "Contact details, role dates, education dates, languages and certifications are filled in automatically from the profile; they are in the text above and in the PDF.",
  };
}

// --- search ------------------------------------------------------------------------------------

interface SearchFile {
  id: string;
  createdAt: string;
  scope: string;
  runs: { source: string; jobs: number; error?: string; seconds: number }[];
  funnel: { fetched: number; unique: number; eligible: number; unclear: number; ineligible: number };
  candidates: string[];
  postings: Record<string, JobPosting>;
}

function latestSearch(ctx: Context): SearchFile | undefined {
  if (!existsSync(ctx.ws.searchesDir)) return undefined;
  const files = readdirSync(ctx.ws.searchesDir).filter((file) => file.endsWith(".json")).sort();
  const last = files.at(-1);
  return last ? (JSON.parse(readFileSync(join(ctx.ws.searchesDir, last), "utf8")) as SearchFile) : undefined;
}

const saveSearch = (ctx: Context, search: SearchFile) => writeAtomic(join(ctx.ws.searchesDir, `${search.id}.json`), JSON.stringify(search));

const workplaceLabel: Record<string, string> = { remote: "Remoto", hybrid: "Híbrido", onsite: "Presencial", unknown: "" };

// Short, readable location: boards list up to 200 countries a remote job is open to.
export function displayLocation(job: JobPosting): string {
  const mode = workplaceLabel[job.workplace];
  if (job.regions.length > 4) {
    const brazil = job.regions.some((region) => /\b(brazil|brasil)\b/i.test(region));
    const where = brazil ? `aberta ao Brasil e a mais ${job.regions.length - 1} países` : `aberta a ${job.regions.length} países`;
    return [mode, where].filter(Boolean).join(" · ");
  }
  const text = job.locationText.length > 80 ? `${job.locationText.slice(0, 77)}…` : job.locationText;
  return [mode, text].filter(Boolean).join(" · ").replace(/^(Remoto|Híbrido|Presencial) · \1/, "$1");
}

// Assesses fetched postings and merges them into the tracked jobs.
function ingest(ctx: Context, state: JobsState, postings: JobPosting[], profile: Profile, prefs: Preferences) {
  const now = ctx.now().toISOString();
  const found = matchers(profile, prefs);
  const assessed = dedupe(postings).map((job) => ({ job, eligibility: assessEligibility(job, prefs, profile), pre: prescore(job, found, prefs, ctx.now()) }));
  for (const { job, eligibility, pre } of assessed) {
    const current = state.jobs[job.id];
    const tracked: TrackedJob = {
      ...(current ?? { firstSeen: now, status: "new" as Status, gaps: [] }),
      id: job.id,
      ref: refOf(job.id),
      source: job.source,
      company: job.company,
      title: job.title,
      url: job.url,
      location: displayLocation(job),
      workplace: job.workplace,
      track: eligibility.track,
      salary: formatSalary(job),
      postedAt: job.postedAt,
      language: detectLanguage(job.description),
      lastSeen: now,
      eligibility: eligibility.verdict,
      reasons: eligibility.reasons,
      prescore: pre.score,
      matched: pre.matched,
      firstSeen: current?.firstSeen ?? now,
      status: current?.status ?? "new",
      gaps: current?.gaps ?? [],
    };
    if (eligibility.verdict !== "ineligible" || current) state.jobs[job.id] = tracked;
  }
  return assessed;
}

const rank = (job: TrackedJob) => job.prescore - (job.eligibility === "unclear" ? 12 : 0);

function summarize(job: TrackedJob, firstSeenNow: string) {
  return {
    ref: job.ref,
    title: job.title,
    company: job.company,
    location: job.location,
    salary: job.salary,
    posted: ptDate(job.postedAt),
    eligibility: job.eligibility,
    notes: job.reasons,
    prescore: job.prescore,
    new: job.firstSeen === firstSeenNow,
    ...(job.verdict ? { already_scored: { score: job.score, verdict: job.verdict } } : {}),
  };
}

export async function searchJobs(ctx: Context, input: { sample?: boolean } = {}) {
  ensureWorkspace(ctx.ws);
  const profile = requireProfile(ctx);
  const prefs = requirePreferences(ctx);
  const runs = await runSearch(planSearch(prefs, loadCompanies(ctx.ws), { sample: input.sample }));
  const postings = runs.flatMap((run) => run.jobs);
  const runSummary = runs.map((run: SourceRun) => ({ source: run.source, jobs: run.jobs.length, error: run.error, seconds: Math.round(run.ms / 100) / 10 }));

  if (input.sample) {
    // Interview mode: recurring requirements, nothing saved.
    const found = matchers(profile, prefs);
    const sample = dedupe(postings)
      .map((job) => ({ job, pre: prescore(job, found, prefs, ctx.now()) }))
      .filter(({ pre }) => pre.score > 0)
      .sort((a, b) => b.pre.score - a.pre.score)
      .slice(0, 15)
      .map(({ job }) => ({ title: job.title, company: job.company, source: job.source, description: job.description.slice(0, 1800) }));
    return { runs: runSummary, sample };
  }

  const state = loadJobs(ctx.ws);
  const now = ctx.now().toISOString();
  const assessed = ingest(ctx, state, postings, profile, prefs);
  const tracked = assessed.map(({ job }) => state.jobs[job.id]).filter((job): job is TrackedJob => Boolean(job));
  const open = tracked.filter((job) => job.eligibility !== "ineligible" && job.status !== "dismissed");
  open.sort((a, b) => rank(b) - rank(a));
  const candidates = open.slice(0, 60);
  saveJobs(ctx.ws, state);

  const ineligibleReasons = new Map<string, number>();
  for (const { eligibility } of assessed.filter((a) => a.eligibility.verdict === "ineligible")) {
    const reason = (eligibility.reasons[0] ?? "outro").replace(/".*"|em .*$/, "").trim();
    ineligibleReasons.set(reason, (ineligibleReasons.get(reason) ?? 0) + 1);
  }
  const funnel = {
    fetched: postings.length,
    unique: assessed.length,
    eligible: assessed.filter((a) => a.eligibility.verdict === "eligible").length,
    unclear: assessed.filter((a) => a.eligibility.verdict === "unclear").length,
    ineligible: assessed.filter((a) => a.eligibility.verdict === "ineligible").length,
  };
  const search: SearchFile = {
    id: stamp(ctx.now()),
    createdAt: now,
    scope: prefs.scope,
    runs: runSummary,
    funnel,
    candidates: candidates.map((job) => job.id),
    postings: Object.fromEntries(assessed.filter(({ job }) => candidates.some((c) => c.id === job.id)).map(({ job }) => [job.id, job])),
  };
  saveSearch(ctx, search);
  const toScore = candidates.filter((job) => !job.verdict).slice(0, SCORE_BATCH).map((job) => job.ref);
  return {
    search_id: search.id,
    runs: runSummary,
    funnel,
    top_ineligible_reasons: [...ineligibleReasons].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reason, count]) => `${reason} (${count})`),
    candidates: candidates.slice(0, 40).map((job) => summarize(job, now)),
    to_score: toScore,
    hint: toScore.length === 0 ? "Every candidate was already scored in an earlier search; go straight to letters and export." : `Have the job-scorer agent score these ${toScore.length} refs (get_jobs gives it the descriptions).`,
  };
}

export function getJobs(ctx: Context, input: { refs: string[] }) {
  const state = loadJobs(ctx.ws);
  const search = latestSearch(ctx);
  const files = existsSync(ctx.ws.searchesDir) ? readdirSync(ctx.ws.searchesDir).filter((f) => f.endsWith(".json")).sort().reverse() : [];
  const posting = (id: string): JobPosting | undefined => {
    if (search?.postings[id]) return search.postings[id];
    for (const file of files.slice(1, 6)) {
      const older = JSON.parse(readFileSync(join(ctx.ws.searchesDir, file), "utf8")) as SearchFile;
      if (older.postings[id]) return older.postings[id];
    }
    return undefined;
  };
  return {
    jobs: input.refs.slice(0, 40).map((ref) => {
      const job = findJob(state, ref);
      if (!job) return { ref, error: "unknown ref" };
      const full = posting(job.id);
      return {
        ref: job.ref,
        title: job.title,
        company: job.company,
        url: job.url,
        location: job.location,
        salary: job.salary,
        employment: full?.employmentType,
        posted: ptDate(job.postedAt),
        posting_language: job.language,
        filter_notes: job.reasons,
        matched_skills: job.matched,
        description: full ? full.description.slice(0, 3_500) + (full.description.length > 3_500 ? " […]" : "") : "(description not kept; open the link)",
      };
    }),
  };
}

export async function addCompaniesFromUrls(ctx: Context, input: { urls: string[]; names?: Record<string, string> }) {
  ensureWorkspace(ctx.ws);
  const profile = requireProfile(ctx);
  const prefs = requirePreferences(ctx);
  const links = atsLinks(input.urls).slice(0, 25);
  if (links.length === 0) return { companies: [], message: "None of these URLs is a Greenhouse, Lever, Ashby, SmartRecruiters, Workable or Recruitee job page." };
  const results = await fetchCompanies(links.map((link) => ({ ...link, name: input.names?.[link.token] })), prefs);
  const withJobs = results.filter((result) => result.jobs.length > 0);
  addCompanies(ctx.ws, withJobs.map((result) => result.company));

  const state = loadJobs(ctx.ws);
  const assessed = ingest(ctx, state, withJobs.flatMap((result) => result.jobs), profile, prefs);
  saveJobs(ctx.ws, state);
  const added = assessed.filter((a) => a.eligibility.verdict !== "ineligible").map((a) => state.jobs[a.job.id]!).filter((job) => job.status !== "dismissed");
  const search = latestSearch(ctx);
  if (search) {
    for (const job of added) {
      if (!search.candidates.includes(job.id)) search.candidates.push(job.id);
      search.postings[job.id] = assessed.find((a) => a.job.id === job.id)!.job;
    }
    saveSearch(ctx, search);
  }
  return {
    companies: results.map((result) => ({ name: result.company.name, ats: result.company.ats, jobs: result.jobs.length, error: result.error })),
    new_candidates: added.map((job) => summarize(job, "")),
    to_score: added.filter((job) => !job.verdict).map((job) => job.ref),
  };
}

// --- scores, letters, status -----------------------------------------------------------------------

export function saveScores(ctx: Context, input: { scores: { ref: string; score: number; verdict: "apply" | "maybe" | "skip"; why: string; gaps?: string[] }[] }) {
  const state = loadJobs(ctx.ws);
  const unknown: string[] = [];
  for (const entry of input.scores) {
    const job = findJob(state, entry.ref);
    if (!job) {
      unknown.push(entry.ref);
      continue;
    }
    Object.assign(job, { score: Math.round(entry.score), verdict: entry.verdict, why: entry.why, gaps: entry.gaps ?? [], scoredAt: ctx.now().toISOString() });
  }
  saveJobs(ctx.ws, state);
  const scored = input.scores.filter((s) => !unknown.includes(s.ref));
  return {
    saved: scored.length,
    unknown_refs: unknown,
    apply: scored.filter((s) => s.verdict === "apply").length,
    maybe: scored.filter((s) => s.verdict === "maybe").length,
    skip: scored.filter((s) => s.verdict === "skip").length,
  };
}

const PLACEHOLDER = /\[[^\]]*\]|\{[^}]*\}|\bTODO\b|\bXXX+\b|<[^>]+>/;

export async function saveCoverLetter(ctx: Context, input: { ref: string; language: Lang; text: string }) {
  ensureWorkspace(ctx.ws);
  const profile = requireProfile(ctx);
  const prefs = loadPreferences(ctx.ws);
  const state = loadJobs(ctx.ws);
  const job = findJob(state, input.ref);
  if (!job) throw new ToolError(`Unknown job ref "${input.ref}".`);
  if (PLACEHOLDER.test(input.text)) throw new ToolError("The letter still has a placeholder ([...], {...}, TODO). Write the final text.");
  const words = input.text.split(/\s+/).filter(Boolean).length;
  if (words < 80 || words > 400) throw new ToolError(`The letter has ${words} words; keep it between 120 and 300.`);
  const basics = profile.basics;
  const contact = [basics.email, basics.phone, ...basics.links.map((link) => link.url.replace(/^https?:\/\/(www\.)?/, ""))].filter(Boolean);
  const letter = { name: basics.name, contact, language: input.language, text: input.text, date: ctx.now(), paper: prefs?.documents.paper };
  const name = safeFileName(`${day(ctx.now())} ${job.company} - ${job.title}`, 90);
  const pdfPath = join(ctx.ws.lettersDir, `${name}.pdf`);
  const docxPath = join(ctx.ws.lettersDir, `${name}.docx`);
  writeAtomic(pdfPath, await renderLetterPdf(letter));
  writeAtomic(docxPath, await renderLetterDocx(letter));
  job.letter = { pdf: pdfPath, docx: docxPath, language: input.language };
  saveJobs(ctx.ws, state);
  return { files: [pdfPath, docxPath], words };
}

export function updateJobStatus(ctx: Context, input: { ref: string; status: string; notes?: string }) {
  const state = loadJobs(ctx.ws);
  const job = findJob(state, input.ref);
  if (!job) throw new ToolError(`Unknown job ref "${input.ref}".`);
  const status = statusFromLabel(input.status);
  if (!status) throw new ToolError(`Unknown status "${input.status}". Use one of: ${STATUSES.map((s) => STATUS_LABEL[s]).join(", ")}.`);
  job.status = status;
  if (input.notes !== undefined) job.notes = input.notes;
  saveJobs(ctx.ws, state);
  return { ref: job.ref, title: job.title, company: job.company, status: STATUS_LABEL[status] };
}

// --- export_jobs ----------------------------------------------------------------------------------

const ACTIVE_ORDER: Status[] = ["offer", "interview", "applied", "interested", "new", "rejected", "dismissed"];

function attentionOf(job: TrackedJob): string {
  return [...job.gaps, ...job.reasons.filter((reason) => /inglês|espanhol|afirmativa|não informad|mas também|só diz/i.test(reason))].join("; ");
}

export async function exportJobs(ctx: Context) {
  ensureWorkspace(ctx.ws);
  const profile = requireProfile(ctx);
  const state = loadJobs(ctx.ws);

  // 1. What the person typed in the spreadsheet wins over what we know.
  let imported = 0;
  let unreadable: string | undefined;
  if (existsSync(ctx.ws.tracker)) {
    try {
      const edits = await readTrackerEdits(ctx.ws.tracker);
      for (const job of Object.values(state.jobs)) {
        const edit = edits.get(job.ref);
        if (!edit) continue;
        const status = edit.status ? statusFromLabel(edit.status) : undefined;
        if (status && status !== job.status) {
          job.status = status;
          imported++;
        }
        if (edit.notes !== undefined && edit.notes !== (job.notes ?? "")) {
          job.notes = edit.notes;
          imported++;
        }
      }
    } catch (error) {
      unreadable = (error as Error).message;
    }
  }
  saveJobs(ctx.ws, state);

  // 2. This search's list as a PDF.
  const search = latestSearch(ctx);
  const inSearch = (search?.candidates ?? []).map((id) => state.jobs[id]).filter((job): job is TrackedJob => Boolean(job));
  const scored = inSearch.filter((job) => job.verdict && job.verdict !== "skip" && job.status !== "dismissed");
  const listed = (scored.length > 0 ? scored : inSearch.filter((job) => job.eligibility === "eligible").slice(0, 20)).sort(
    (a, b) => (b.score ?? b.prescore) - (a.score ?? a.prescore),
  );
  const cards: JobCard[] = listed.map((job) => ({
    ref: job.ref,
    title: job.title,
    company: job.company,
    url: job.url,
    location: job.location,
    salary: job.salary,
    employment: search?.postings[job.id]?.employmentType,
    posted: ptDate(job.postedAt),
    score: job.score,
    verdict: job.verdict,
    why: job.why,
    gaps: job.gaps,
    reasons: job.reasons,
    source: SOURCE_LABEL[job.source as SourceName] ?? job.source,
    letter: job.letter ? basename(job.letter.pdf) : undefined,
    isNew: job.firstSeen === search?.createdAt,
  }));
  const sources = [...new Set((search?.runs ?? []).filter((run) => run.jobs > 0).map((run) => (run.source === "companies" ? "sites de carreira de empresas (Greenhouse, Lever, Ashby...)" : SOURCE_LABEL[run.source as SourceName] ?? run.source)))];
  const f = search?.funnel;
  const summary = f ? `${f.fetched} vagas lidas, ${f.eligible + f.unclear} passaram pelos filtros, ${listed.length} na lista.` : `${listed.length} vagas na lista.`;
  const pdfPath = join(ctx.ws.jobsDir, `Vagas ${day(ctx.now())}.pdf`);
  writeAtomic(pdfPath, await renderJobListPdf({ name: profile.basics.name, date: ctx.now(), summary, cards, sources }));

  // 3. The cumulative spreadsheet.
  const rows: TrackerRow[] = Object.values(state.jobs)
    .filter((job) => job.verdict !== undefined || job.status !== "new")
    .filter((job) => job.verdict !== "skip" || job.status !== "new")
    .sort((a, b) => ACTIVE_ORDER.indexOf(a.status) - ACTIVE_ORDER.indexOf(b.status) || (b.score ?? 0) - (a.score ?? 0))
    .map((job) => ({
      ref: job.ref,
      status: STATUS_LABEL[job.status],
      score: job.score,
      verdict: job.verdict ? VERDICT_LABEL[job.verdict] : undefined,
      title: job.title,
      company: job.company,
      location: job.location,
      salary: job.salary,
      why: job.why,
      attention: attentionOf(job),
      url: job.url,
      source: SOURCE_LABEL[job.source as SourceName] ?? job.source,
      found: ptDate(job.firstSeen) ?? "",
      letter: job.letter ? basename(job.letter.pdf) : undefined,
      notes: job.notes,
    }));
  const xlsx = await renderTracker(rows, STATUSES.map((status) => STATUS_LABEL[status]));
  let trackerPath = ctx.ws.tracker;
  let trackerLocked = false;
  try {
    writeAtomic(trackerPath, xlsx);
  } catch (error) {
    // Excel on Windows locks open files.
    if (!/EBUSY|EPERM|EACCES/.test(String((error as NodeJS.ErrnoException).code))) throw error;
    trackerLocked = true;
    trackerPath = join(ctx.ws.jobsDir, `Acompanhamento de vagas (atualizado ${day(ctx.now())}).xlsx`);
    writeFileSync(trackerPath, xlsx);
  }
  return {
    pdf: pdfPath,
    tracker: trackerPath,
    tracker_locked: trackerLocked,
    tracker_unreadable: unreadable,
    edits_imported: imported,
    listed: listed.length,
    tracker_rows: rows.length,
    top: listed.slice(0, 10).map((job) => ({ ref: job.ref, score: job.score, verdict: job.verdict, title: job.title, company: job.company, location: job.location, why: job.why, url: job.url, letter: Boolean(job.letter) })),
  };
}

// --- open_path ----------------------------------------------------------------------------------------

export function openPath(ctx: Context, input: { target: "folder" | "resume" | "resume_docx" | "jobs_pdf" | "tracker" | "letters" | "file"; path?: string }) {
  ensureWorkspace(ctx.ws);
  const newest = (dir: string, pattern: RegExp) => {
    if (!existsSync(dir)) return undefined;
    const files = readdirSync(dir).filter((file) => pattern.test(file)).map((file) => join(dir, file));
    return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  };
  const target =
    input.target === "folder"
      ? ctx.ws.root
      : input.target === "resume"
        ? newest(ctx.ws.resumeDir, /^Curriculo.*\.pdf$/i) ?? newest(ctx.ws.resumeDir, /\.pdf$/i)
        : input.target === "resume_docx"
          ? newest(ctx.ws.resumeDir, /\.docx$/i)
          : input.target === "jobs_pdf"
            ? newest(ctx.ws.jobsDir, /^Vagas .*\.pdf$/i)
            : input.target === "tracker"
              ? newest(ctx.ws.jobsDir, /\.xlsx$/i)
              : input.target === "letters"
                ? ctx.ws.lettersDir
                : input.path
                  ? cleanPath(input.path)
                  : undefined;
  if (!target || !existsSync(target)) throw new ToolError("Nothing to open yet.");
  if (!isInside(ctx.ws.root, target)) throw new ToolError("Only files inside the Pathfinder folder can be opened.");
  openWithSystem(target);
  return { opened: target };
}
