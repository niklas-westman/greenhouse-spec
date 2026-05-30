import { z } from "zod";

import { schemaVersionSchema } from "./common.js";

export const semanticIndexSchema = z.object({
  schema_version: schemaVersionSchema,
  managed_by: z.literal("greenhouse-spec"),
  generated_at: z.union([z.string().min(1), z.date()]),
  policy: z.object({
    effect: z.string().min(1),
    requirement: z.string().min(1),
  }),
  matches: z.array(
    z.object({
      id: z.string().min(1),
      kind: z.enum(["memory", "skill"]),
      path: z.string().min(1),
      status: z.enum(["adopted", "draft", "proposed"]).optional(),
      reason: z.string().min(1),
      score: z.number().optional(),
      query_hints: z.array(z.string().min(1)).default([]),
    }),
  ),
});

export type SemanticIndex = z.infer<typeof semanticIndexSchema>;
export type SemanticIndexMatch = SemanticIndex["matches"][number];
