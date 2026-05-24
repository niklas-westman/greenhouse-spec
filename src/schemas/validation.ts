import { z } from "zod";

import {
  commandCheckSchema,
  confidenceSchema,
  manualCheckSchema,
  modeSchema,
  schemaVersionSchema,
} from "./common.js";

const validationRuleSchema = z.object({
  managed_by: z.literal("greenhouse-spec").optional(),
  origin: z.enum(["repo-shape", "package-script", "manual"]).optional(),
  proposal_id: z.string().min(1).optional(),
  confidence: confidenceSchema.optional(),
  mode: modeSchema.optional(),
  required: z.array(commandCheckSchema).default([]),
  recommended: z.array(commandCheckSchema).default([]),
  manual: z.array(manualCheckSchema).default([]),
});

export const validationSchema = z.object({
  schema_version: schemaVersionSchema,
  defaults: validationRuleSchema.optional(),
  timeouts: z
    .object({
      default_seconds: z.number().int().positive(),
      long_seconds: z.number().int().positive(),
    })
    .optional(),
  modes: z.partialRecord(modeSchema, validationRuleSchema).optional(),
  paths: z.record(z.string().min(1), validationRuleSchema).optional(),
  risks: z.record(z.string().min(1), validationRuleSchema).optional(),
  blocked: z
    .record(
      z.string().min(1),
      z.object({
        patterns: z.array(z.string().min(1)).min(1),
        action: z.string().min(1),
      }),
    )
    .optional(),
});

export type ValidationConfig = z.infer<typeof validationSchema>;
