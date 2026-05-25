import { z } from "zod";

import {
  commandCheckSchema,
  confidenceSchema,
  manualCheckSchema,
  modeSchema,
  schemaVersionSchema,
} from "./common.js";

const proposalStatusSchema = z.enum([
  "pending",
  "adoptable",
  "applied",
  "skipped",
  "conflict",
]);

const proposalBaseSchema = z.object({
  id: z.string().min(1),
  idempotency_key: z.string().min(1).default("legacy"),
  status: proposalStatusSchema,
  confidence: confidenceSchema,
  reason: z.string().min(1),
  safe: z.boolean(),
  preconditions: z.array(z.string().min(1)).default([]),
  collision: z.object({
    human_owned: z.boolean(),
    explanation: z.string().min(1).optional(),
  }).optional(),
});

export const validationProposalSchema = z.discriminatedUnion("kind", [
  proposalBaseSchema.extend({
    kind: z.literal("package-script"),
    target: z.object({
      path: z.literal("package.json"),
    }),
    package_script: z.object({
      name: z.string().min(1),
      command: z.string().min(1),
      existing_command: z.string().min(1).optional(),
    }),
  }),
  proposalBaseSchema.extend({
    kind: z.literal("validation-route"),
    target: z.object({
      path: z.literal(".greenhouse/roots/validation.yaml"),
    }),
    validation_route: z.object({
      pattern: z.string().min(1),
      rule: z.object({
        managed_by: z.literal("greenhouse-spec"),
        origin: z.literal("repo-shape"),
        proposal_id: z.string().min(1),
        confidence: confidenceSchema,
        mode: modeSchema.optional(),
        required: z.array(commandCheckSchema).default([]),
        recommended: z.array(commandCheckSchema).default([]),
        manual: z.array(manualCheckSchema).default([]),
      }),
    }),
  }),
]);

export const validationProposalsSchema = z.object({
  schema_version: schemaVersionSchema,
  managed_by: z.literal("greenhouse-spec"),
  generated_at: z.union([z.string().min(1), z.date()]),
  proposals: z.array(validationProposalSchema).default([]),
});

export type ValidationProposal = z.infer<typeof validationProposalSchema>;
export type ValidationProposals = z.infer<typeof validationProposalsSchema>;
