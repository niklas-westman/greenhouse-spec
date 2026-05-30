import { z } from "zod";

import { schemaVersionSchema } from "./common.js";

export const evidenceIndexSchema = z.object({
  schema_version: schemaVersionSchema,
  managed_by: z.literal("greenhouse-spec"),
  generated_at: z.union([z.string().min(1), z.date()]),
  policy: z.object({
    agent_reading: z.string().min(1),
    retention: z.string().min(1),
  }),
  summary: z.object({
    latest_tending_state: z.string().min(1).optional(),
    latest_tending_evidence: z.string().min(1).optional(),
    latest_failures_by_command: z.array(
      z.object({
        command: z.string().min(1),
        evidence: z.string().min(1),
        notes: z.string().min(1),
      }),
    ),
  }).optional(),
  recent: z.array(
    z.object({
      path: z.string().min(1),
      modified_at: z.union([z.string().min(1), z.date()]),
      summary: z.string().min(1),
      status: z.enum(["pass", "fail"]).optional(),
      mode: z.string().min(1).optional(),
      changed_files: z.array(z.string()).optional(),
      commands: z.array(z.string()).optional(),
      context_loaded: z.array(z.string()).optional(),
      failed_commands: z.array(
        z.object({
          command: z.string().min(1),
          notes: z.string().min(1),
        }),
      ).optional(),
      manual_checks: z.array(z.string()).optional(),
      impact_warnings: z.array(z.string()).optional(),
      tending_state: z.string().min(1).optional(),
    }),
  ),
});

export type EvidenceIndex = z.infer<typeof evidenceIndexSchema>;
