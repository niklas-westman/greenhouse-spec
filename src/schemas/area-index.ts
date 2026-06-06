import { z } from "zod";

import { confidenceSchema, schemaVersionSchema } from "./common.js";

export const areaIndexSchema = z.object({
  schema_version: schemaVersionSchema,
  managed_by: z.literal("greenhouse-spec"),
  generated_at: z.union([z.string().min(1), z.date()]),
  policy: z.object({
    purpose: z.string().min(1),
    authority: z.string().min(1),
  }),
  areas: z.array(
    z.object({
      id: z.string().min(1),
      path: z.string().min(1),
      kind: z.string().min(1),
      purpose: z.string().min(1),
      confidence: confidenceSchema,
      signals: z.array(z.string().min(1)).default([]),
      validation: z.object({
        status: z.enum(["covered", "fallback", "missing"]),
        routes: z.array(z.string().min(1)).default([]),
        commands: z.array(z.string().min(1)).default([]),
        manual_checks: z.array(z.string().min(1)).default([]),
      }),
      risks: z.array(z.string().min(1)).default([]),
      gaps: z.array(z.string().min(1)).default([]),
    }),
  ).default([]),
});

export type AreaIndex = z.infer<typeof areaIndexSchema>;
