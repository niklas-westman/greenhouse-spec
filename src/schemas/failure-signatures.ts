import { z } from "zod";

import { schemaVersionSchema } from "./common.js";

export const failureSignaturesSchema = z.object({
  schema_version: schemaVersionSchema,
  managed_by: z.literal("greenhouse-spec"),
  generated_at: z.string().min(1),
  policy: z.object({
    effect: z.string().min(1),
  }),
  signatures: z.array(
    z.object({
      id: z.string().min(1),
      command: z.string().min(1),
      normalized_failure: z.string().min(1),
      count: z.number().int().nonnegative(),
      first_seen_at: z.string().min(1),
      last_seen_at: z.string().min(1),
      evidence_paths: z.array(z.string().min(1)),
    }),
  ),
});

export type FailureSignatures = z.infer<typeof failureSignaturesSchema>;
