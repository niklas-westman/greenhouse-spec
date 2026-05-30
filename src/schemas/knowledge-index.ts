import { z } from "zod";

import { schemaVersionSchema } from "./common.js";
import { memoryTypeSchema, skillStatusSchema } from "./context-manifest.js";

export const freshnessSchema = z.enum(["fresh", "stale", "expired", "unknown"]);

const metadataSchema = z.object({
  status: skillStatusSchema.optional(),
  authority: z.enum(["low", "medium", "high"]).optional(),
  created: z.string().min(1).optional(),
  last_reviewed: z.string().min(1).optional(),
  last_used: z.string().min(1).optional(),
  review_after_days: z.number().int().positive().optional(),
  owner: z.string().min(1).optional(),
});

export const memoryIndexEntrySchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  memory_type: memoryTypeSchema,
  status: skillStatusSchema,
  authority: z.enum(["low", "medium", "high"]).default("medium"),
  freshness: freshnessSchema.default("unknown"),
  keywords: z.array(z.string().min(1)).default([]),
  metadata: metadataSchema.default({}),
});

export const memoryIndexSchema = z.object({
  schema_version: schemaVersionSchema,
  managed_by: z.literal("greenhouse-spec"),
  generated_at: z.union([z.string().min(1), z.date()]),
  policy: z.object({
    canonical_source: z.string().min(1),
    generated_index: z.string().min(1),
  }),
  memories: z.array(memoryIndexEntrySchema),
});

export const skillIndexEntrySchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  status: skillStatusSchema,
  freshness: freshnessSchema.default("unknown"),
  keywords: z.array(z.string().min(1)).default([]),
  metadata: metadataSchema.default({}),
});

export const skillIndexSchema = z.object({
  schema_version: schemaVersionSchema,
  managed_by: z.literal("greenhouse-spec"),
  generated_at: z.union([z.string().min(1), z.date()]),
  policy: z.object({
    canonical_source: z.string().min(1),
    generated_index: z.string().min(1),
  }),
  skills: z.array(skillIndexEntrySchema),
});

export type MemoryIndex = z.infer<typeof memoryIndexSchema>;
export type MemoryIndexEntry = z.infer<typeof memoryIndexEntrySchema>;
export type SkillIndex = z.infer<typeof skillIndexSchema>;
export type SkillIndexEntry = z.infer<typeof skillIndexEntrySchema>;
