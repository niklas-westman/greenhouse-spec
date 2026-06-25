import { z } from "zod";

import { schemaVersionSchema } from "./common.js";

export const docsCoverageStrictnessValues = [
  "advisory",
  "warning",
  "guarded",
  "blocking",
] as const;

export const docsCoverageStrictnessSchema = z.enum(docsCoverageStrictnessValues);

export const docsOwnershipValues = [
  "setup",
  "package-scripts",
  "validation",
  "cli",
  "api",
  "env",
  "deployment",
  "desktop",
  "workspace",
  "ci",
  "generated",
] as const;

export const docsOwnershipSchema = z.enum(docsOwnershipValues);

export const trackedDocSchema = z.object({
  path: z.string().min(1),
  owns: z.array(docsOwnershipSchema).default([]),
  notes: z.string().min(1).optional(),
  covers: z.array(
    z.object({
      path: z.string().min(1),
      reason: z.string().min(1),
      strictness: docsCoverageStrictnessSchema.default("warning"),
    }),
  ).default([]),
});

export const docsRootSchema = z.object({
  schema_version: schemaVersionSchema,
  tracked_docs: z.array(trackedDocSchema).default([]),
});

export type DocsRoot = z.infer<typeof docsRootSchema>;
export type DocsOwnership = z.infer<typeof docsOwnershipSchema>;
export type DocsCoverageStrictness = z.infer<typeof docsCoverageStrictnessSchema>;
