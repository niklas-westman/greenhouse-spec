import { z } from "zod";

import { modeSchema, schemaVersionSchema } from "./common.js";

export const commandResultSchema = z.enum(["pass", "fail", "not_run"]);

export const evidenceSchema = z.object({
  schema_version: schemaVersionSchema,
  change_id: z.string().min(1),
  change_mode: modeSchema,
  changed_files: z.array(z.string().min(1)),
  risks: z.array(z.string().min(1)).default([]),
  context_loaded: z.array(z.string().min(1)).default([]),
  commands: z.array(
    z.object({
      command: z.string().min(1),
      result: commandResultSchema,
      notes: z.string().optional(),
    }),
  ),
  manual_checks: z
    .array(
      z.object({
        check: z.string().min(1),
        result: z.enum(["pending", "pass", "fail"]),
        evidence: z.string().optional(),
      }),
    )
    .default([]),
  skipped_validation: z.string().nullable().default(null),
  regressions_or_gaps: z.array(z.string().min(1)).default([]),
  durable_learnings: z.array(z.string().min(1)).default([]),
});

export type VerificationEvidence = z.infer<typeof evidenceSchema>;
