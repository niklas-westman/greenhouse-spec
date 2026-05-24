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
  recent: z.array(
    z.object({
      path: z.string().min(1),
      modified_at: z.union([z.string().min(1), z.date()]),
      summary: z.string().min(1),
    }),
  ),
});

export type EvidenceIndex = z.infer<typeof evidenceIndexSchema>;
