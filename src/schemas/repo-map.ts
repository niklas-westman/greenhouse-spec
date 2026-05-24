import { z } from "zod";

import { confidenceSchema, schemaVersionSchema } from "./common.js";

export const repoMapSchema = z.object({
  schema_version: schemaVersionSchema,
  managed_by: z.literal("greenhouse-spec"),
  generated_at: z.union([z.string().min(1), z.date()]),
  confidence: confidenceSchema,
  source: z
    .array(
      z.object({
        path: z.string().min(1),
        kind: z.string().min(1),
        confidence: confidenceSchema,
      }),
    )
    .default([]),
  tests: z
    .array(
      z.object({
        path: z.string().min(1),
        runner: z.string().min(1),
        confidence: confidenceSchema,
      }),
    )
    .default([]),
  docs: z
    .array(
      z.object({
        path: z.string().min(1),
        authority: confidenceSchema,
      }),
    )
    .default([]),
  generated: z
    .array(
      z.object({
        path: z.string().min(1),
        reason: z.string().min(1),
      }),
    )
    .default([]),
  agent_files: z
    .array(
      z.object({
        path: z.string().min(1),
        present: z.boolean(),
      }),
    )
    .default([]),
});

export type RepoMap = z.infer<typeof repoMapSchema>;
