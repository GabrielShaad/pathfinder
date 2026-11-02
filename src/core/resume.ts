import { z } from "zod";
import { LANGUAGES } from "./profile.js";

// The one resume the resume-writer agent produces (Horizon's "tailored" resume
// without per-job variants). Every sentence carries the fact ids it is based on.

export const BulletSchema = z.object({
  text: z.string().min(1),
  fact_ids: z.array(z.string()).min(1),
});

export const ResumeDocSchema = z.object({
  language: z.enum(LANGUAGES),
  paper: z.enum(["a4", "us-letter"]).default("a4"),
  headline: z.string().min(1),
  summary: BulletSchema,
  skills: z.array(z.object({ category: z.string().min(1), items: z.array(z.string()).min(1) })).default([]),
  experience: z.array(z.object({ role_id: z.string(), bullets: z.array(BulletSchema) })).default([]),
  earlier_role_ids: z.array(z.string()).default([]),
  projects: z.array(z.object({ project_id: z.string(), bullets: z.array(BulletSchema).min(1) })).default([]),
  education_ids: z.array(z.string()).default([]),
});

export type ResumeDoc = z.infer<typeof ResumeDocSchema>;
export type ResumeDocInput = z.input<typeof ResumeDocSchema>;
export type Bullet = z.infer<typeof BulletSchema>;
