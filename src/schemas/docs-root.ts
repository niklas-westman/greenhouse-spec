import { z } from "zod";

import { schemaVersionSchema } from "./common.js";

export const docsOwnershipSchema = z.enum([
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
]);

export const trackedDocSchema = z.object({
  path: z.string().min(1),
  owns: z.array(docsOwnershipSchema).default([]),
  notes: z.string().min(1).optional(),
});

export const docsRootSchema = z.object({
  schema_version: schemaVersionSchema,
  tracked_docs: z.array(trackedDocSchema).default([]),
});

export type DocsRoot = z.infer<typeof docsRootSchema>;
export type DocsOwnership = z.infer<typeof docsOwnershipSchema>;
