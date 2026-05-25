import { z } from "zod";

import { confidenceSchema, schemaVersionSchema } from "./common.js";

const commandSetSchema = z.object({
  build: z.string().min(1).nullable().optional(),
  lint: z.string().min(1).nullable().optional(),
  test: z.string().min(1).nullable().optional(),
  typecheck: z.string().min(1).nullable().optional(),
});

export const repoShapeSchema = z.object({
  schema_version: schemaVersionSchema,
  managed_by: z.literal("greenhouse-spec"),
  generated_at: z.union([z.string().min(1), z.date()]),
  confidence: confidenceSchema,
  shape: z.array(z.string().min(1)).default([]),
  package_manager: z.string().min(1).nullable().optional(),
  packages: z.array(
    z.object({
      path: z.string().min(1),
      name: z.string().min(1).nullable(),
      kind: z.array(z.string().min(1)).default([]),
      languages: z.array(z.string().min(1)).default([]),
      frameworks: z.array(z.string().min(1)).default([]),
      commands: commandSetSchema,
      confidence: confidenceSchema,
    }),
  ).default([]),
  java_modules: z.array(
    z.object({
      path: z.string().min(1),
      artifact_id: z.string().min(1).nullable(),
      build_tool: z.literal("maven"),
      commands: commandSetSchema,
      confidence: confidenceSchema,
    }),
  ).default([]),
  rust_modules: z.array(
    z.object({
      path: z.string().min(1),
      package_name: z.string().min(1).nullable(),
      build_tool: z.literal("cargo"),
      commands: commandSetSchema,
      confidence: confidenceSchema,
    }),
  ).default([]),
  generated: z.array(
    z.object({
      path: z.string().min(1),
      reason: z.string().min(1),
      confidence: confidenceSchema,
    }),
  ).default([]),
  gaps: z.array(
    z.object({
      id: z.string().min(1),
      severity: z.enum(["info", "warning"]),
      message: z.string().min(1),
      paths: z.array(z.string().min(1)).default([]),
    }),
  ).default([]),
});

export type RepoShape = z.infer<typeof repoShapeSchema>;
