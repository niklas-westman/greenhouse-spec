import { z } from "zod";

import { modeSchema, schemaVersionSchema } from "./common.js";

export const projectSchema = z.object({
  schema_version: schemaVersionSchema,
  profile_version: z.literal(1),
  repo: z.object({
    name: z.string().min(1),
    description: z.string().min(1).optional(),
    type: z.array(z.string().min(1)).min(1),
    default_branch: z.string().min(1).nullable().optional(),
  }),
  stack: z.object({
    package_manager: z.string().min(1).nullable().optional(),
    languages: z.array(z.string().min(1)).default([]),
    runtimes: z.record(z.string().min(1), z.string().min(1)).default({}),
    frameworks: z.array(z.string().min(1)).default([]),
    test_runners: z.array(z.string().min(1)).default([]),
  }),
  greenhouse: z.object({
    folder: z.literal(".greenhouse"),
    created_at: z.union([z.string().min(1), z.date()]),
    last_inspected_at: z.union([z.string().min(1), z.date()]).nullable(),
    mode_default: modeSchema,
  }),
});

export type ProjectConfig = z.infer<typeof projectSchema>;
