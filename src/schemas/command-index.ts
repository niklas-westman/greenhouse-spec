import { z } from "zod";

import { confidenceSchema, schemaVersionSchema } from "./common.js";

export const commandIndexSchema = z.object({
  schema_version: schemaVersionSchema,
  managed_by: z.literal("greenhouse-spec"),
  generated_at: z.union([z.string().min(1), z.date()]),
  package_manager: z.string().min(1).nullable().optional(),
  commands: z.array(
    z.object({
      id: z.string().min(1),
      command: z.string().min(1),
      source: z.string().min(1),
      purpose: z.string().min(1),
      confidence: confidenceSchema,
    }),
  ),
});

export type CommandIndex = z.infer<typeof commandIndexSchema>;
