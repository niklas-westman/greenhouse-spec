import { z } from "zod";

import { confidenceSchema, schemaVersionSchema } from "./common.js";
import { docsCoverageStrictnessSchema } from "./docs-root.js";
import { freshnessSchema } from "./knowledge-index.js";

const knowledgeSourceSchema = z.object({
  id: z.string().min(1).optional(),
  path: z.string().min(1),
  title: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  freshness: freshnessSchema.optional(),
  reason: z.string().min(1),
});

export const treeOfKnowledgeSchema = z.object({
  schema_version: schemaVersionSchema,
  managed_by: z.literal("greenhouse-spec"),
  generated_at: z.union([z.string().min(1), z.date()]),
  policy: z.object({
    purpose: z.string().min(1),
    authority: z.string().min(1),
    agent_reading: z.string().min(1),
  }),
  generated_tree: z.object({
    index: z.string().min(1),
    areas_dir: z.string().min(1),
  }),
  areas: z.array(
    z.object({
      id: z.string().min(1),
      path: z.string().min(1),
      page_path: z.string().min(1),
      kind: z.string().min(1),
      purpose: z.string().min(1),
      summary: z.string().min(1),
      confidence: confidenceSchema,
      docs: z.array(
        z.object({
          path: z.string().min(1),
          reason: z.string().min(1),
          strictness: docsCoverageStrictnessSchema,
        }),
      ).default([]),
      validation: z.object({
        status: z.enum(["covered", "fallback", "missing"]),
        routes: z.array(z.string().min(1)).default([]),
        commands: z.array(z.string().min(1)).default([]),
        manual_checks: z.array(z.string().min(1)).default([]),
      }),
      risks: z.array(z.string().min(1)).default([]),
      memory_sources: z.array(knowledgeSourceSchema).default([]),
      skill_sources: z.array(knowledgeSourceSchema).default([]),
      evidence: z.array(
        z.object({
          path: z.string().min(1),
          summary: z.string().min(1),
          status: z.enum(["pass", "fail"]).optional(),
          reason: z.string().min(1),
        }),
      ).default([]),
      agent_actions: z.array(z.string().min(1)).default([]),
    }),
  ).default([]),
});

export type TreeOfKnowledge = z.infer<typeof treeOfKnowledgeSchema>;
export type TreeOfKnowledgeArea = TreeOfKnowledge["areas"][number];
