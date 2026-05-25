import { z } from "zod";

import { schemaVersionSchema } from "./common.js";

export const proposalDecisionsSchema = z.object({
  schema_version: schemaVersionSchema,
  dismissed: z.array(
    z.object({
      id: z.string().min(1),
      idempotency_key: z.string().min(1),
      reason: z.string().min(1),
      decided_at: z.union([z.string().min(1), z.date()]),
    }),
  ).default([]),
});

export type ProposalDecisions = z.infer<typeof proposalDecisionsSchema>;
