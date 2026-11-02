import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { LANGUAGES, PreferencesSchema, ProfileSchema, ResumeDocSchema } from "../core/index.js";
import {
  addCompaniesFromUrls,
  buildResume,
  defaultContext,
  exportJobs,
  getJobs,
  getProfile,
  getResume,
  importResume,
  openPath,
  PLUGIN_VERSION,
  saveCoverLetter,
  savePreferencesTool,
  saveProfileTool,
  saveScores,
  searchJobs,
  setupStatus,
  updateJobStatus,
} from "./tools.js";

// The Pathfinder MCP server: every file the plugin reads or writes goes through
// these tools, so the agents never need Bash or Write.

const server = new McpServer({ name: "pathfinder", version: PLUGIN_VERSION });
const ctx = defaultContext();

const reply = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 1) }] });
const failure = (error: unknown) => {
  const message = error instanceof z.ZodError ? `Invalid input:\n${z.prettifyError(error)}` : (error as Error).message;
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
};
const run =
  <A>(handler: (args: A) => unknown) =>
  async (args: A) => {
    try {
      return reply(await handler(args));
    } catch (error) {
      return failure(error);
    }
  };

server.registerTool(
  "setup_status",
  {
    title: "Pathfinder status",
    description: "Checks that Pathfinder is ready: runtime version, the person's Pathfinder folder, whether a profile and preferences exist, resume files and the last search. Call first in every Pathfinder skill.",
    inputSchema: {},
  },
  run(() => setupStatus(ctx)),
);

server.registerTool(
  "import_resume",
  {
    title: "Import the current resume",
    description: "Reads the person's current resume (PDF, DOCX, ODT, TXT or MD file path, or pasted text), keeps a copy in the Pathfinder folder and returns its text plus an ATS diagnosis of the original. With no arguments it takes the newest resume file saved directly in the Pathfinder folder.",
    inputSchema: { path: z.string().optional().describe("Absolute path to the file (dragged into the terminal or attached)"), text: z.string().optional().describe("Resume text pasted by the person") },
  },
  run((args: { path?: string; text?: string }) => importResume(ctx, args)),
);

server.registerTool(
  "get_profile",
  {
    title: "Read profile and preferences",
    description: "Returns the saved profile (facts, roles, skills), the search preferences and open profile issues.",
    inputSchema: {},
  },
  run(() => getProfile(ctx)),
);

server.registerTool(
  "save_profile",
  {
    title: "Save the profile",
    description: "Saves the whole profile (replaces the previous one). Only facts from the person's resume or their own answers; never invent experience, numbers or skills. Roles newest first; fact ids are lowercase-with-dashes and unique.",
    inputSchema: { profile: ProfileSchema },
  },
  run((args: { profile: z.input<typeof ProfileSchema> }) => saveProfileTool(ctx, args.profile)),
);

server.registerTool(
  "save_preferences",
  {
    title: "Save search preferences",
    description: "Saves the job-search preferences from the interview (replaces the previous ones).",
    inputSchema: { preferences: PreferencesSchema },
  },
  run((args: { preferences: z.input<typeof PreferencesSchema> }) => savePreferencesTool(ctx, args.preferences)),
);

server.registerTool(
  "build_resume",
  {
    title: "Build the resume",
    description: "Fact-checks a resume document against the profile (fact ids, numbers, skills), then writes the PDF and DOCX to 'Meu currículo' and reads the PDF back like an ATS. Returns errors to fix, warnings, files and market keyword coverage.",
    inputSchema: { resume: ResumeDocSchema },
  },
  run((args: { resume: z.input<typeof ResumeDocSchema> }) => buildResume(ctx, args.resume)),
);

server.registerTool(
  "get_resume",
  {
    title: "Read the built resume",
    description: "Returns the last resume document built in one language (with its fact ids), its plain text and the fact-check result. Used by the reviewer.",
    inputSchema: { language: z.enum(LANGUAGES) },
  },
  run((args: { language: (typeof LANGUAGES)[number] }) => getResume(ctx, args)),
);

server.registerTool(
  "search_jobs",
  {
    title: "Search jobs",
    description: "Runs the job search from the saved preferences on free public sources (Gupy, Himalayas, Jobicy, We Work Remotely, Remotive, Remote OK, company ATS boards), filters and pre-ranks. Takes up to ~90 s. With sample=true it only returns ~15 posting excerpts for the interview and saves nothing.",
    inputSchema: { sample: z.boolean().optional() },
  },
  run((args: { sample?: boolean }) => searchJobs(ctx, args)),
);

server.registerTool(
  "get_jobs",
  {
    title: "Get job details",
    description: "Returns the posting text (truncated) and filter notes for up to 40 job refs from the latest searches.",
    inputSchema: { refs: z.array(z.string()).min(1).max(40) },
  },
  run((args: { refs: string[] }) => getJobs(ctx, args)),
);

server.registerTool(
  "add_companies_from_urls",
  {
    title: "Add companies from job URLs",
    description: "Given job or careers URLs on Greenhouse, Lever, Ashby, SmartRecruiters, Workable or Recruitee (e.g. from a web search), fetches each company's open jobs from its public board, adds matching ones to the current search and remembers the company for future searches.",
    inputSchema: {
      urls: z.array(z.string()).min(1).max(40),
      names: z.record(z.string(), z.string()).optional().describe("Optional company names by board token"),
    },
  },
  run((args: { urls: string[]; names?: Record<string, string> }) => addCompaniesFromUrls(ctx, args)),
);

server.registerTool(
  "save_scores",
  {
    title: "Save job scores",
    description: "Saves the job-scorer's verdicts (score 0-100, apply|maybe|skip, why and gaps in Portuguese) for job refs.",
    inputSchema: {
      scores: z
        .array(z.object({ ref: z.string(), score: z.number().min(0).max(100), verdict: z.enum(["apply", "maybe", "skip"]), why: z.string().min(1), gaps: z.array(z.string()).optional() }))
        .min(1),
    },
  },
  run((args: { scores: { ref: string; score: number; verdict: "apply" | "maybe" | "skip"; why: string; gaps?: string[] }[] }) => saveScores(ctx, args)),
);

server.registerTool(
  "save_cover_letter",
  {
    title: "Save a cover letter",
    description: "Writes the final cover letter text for one job as PDF and DOCX in 'Vagas/Cartas'. The text must be final (no placeholders), 120-300 words, in the given language.",
    inputSchema: { ref: z.string(), language: z.enum(LANGUAGES), text: z.string().min(200) },
  },
  run((args: { ref: string; language: (typeof LANGUAGES)[number]; text: string }) => saveCoverLetter(ctx, args)),
);

server.registerTool(
  "export_jobs",
  {
    title: "Export the job list",
    description: "Writes this search's job list as a PDF and updates the cumulative tracking spreadsheet (keeping the Status and notes the person typed in it). Returns paths and the top jobs for the chat summary.",
    inputSchema: {},
  },
  run(() => exportJobs(ctx)),
);

server.registerTool(
  "update_job_status",
  {
    title: "Update a job's status",
    description: "Sets a job's status when the person reports progress: Nova, Quero aplicar, Aplicada, Entrevista, Proposta, Não avançou or Descartada (or new, interested, applied, interview, offer, rejected, dismissed).",
    inputSchema: { ref: z.string(), status: z.string(), notes: z.string().optional() },
  },
  run((args: { ref: string; status: string; notes?: string }) => updateJobStatus(ctx, args)),
);

server.registerTool(
  "open_path",
  {
    title: "Open a Pathfinder file",
    description: "Opens the Pathfinder folder or one of its files with the computer's default app (the resume PDF, the resume DOCX, the latest job list PDF, the tracking spreadsheet, the letters folder, or a file path inside the Pathfinder folder).",
    inputSchema: { target: z.enum(["folder", "resume", "resume_docx", "jobs_pdf", "tracker", "letters", "file"]), path: z.string().optional() },
  },
  run((args: { target: "folder" | "resume" | "resume_docx" | "jobs_pdf" | "tracker" | "letters" | "file"; path?: string }) => openPath(ctx, args)),
);

await server.connect(new StdioServerTransport());
