import { z } from "zod";

import { schemaVersionSchema } from "./common.js";

const activationSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("always"),
  }),
  z.object({
    mode: z.literal("risk"),
    risks: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    mode: z.literal("keyword"),
    keywords: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    mode: z.literal("path"),
    paths: z.array(z.string().min(1)).min(1),
  }),
]);

export const contextManifestSchema = z.object({
  schema_version: schemaVersionSchema,
  context: z.array(
    z.object({
      id: z.string().min(1),
      type: z.enum(["rule", "doc", "skill"]),
      path: z.string().min(1),
      activation: activationSchema,
      budget: z.object({
        max_tokens: z.number().int().positive(),
      }),
    }),
  ),
});

export type ContextManifest = z.infer<typeof contextManifestSchema>;
