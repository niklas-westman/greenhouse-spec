import { z } from "zod";

import { schemaVersionSchema } from "./common.js";

export const contextActivationSchema = z.discriminatedUnion("mode", [
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

export const contextKindSchema = z.enum([
  "rule",
  "doc",
  "memory",
  "skill",
  "evidence",
  "report",
]);

export const memoryTypeSchema = z.enum([
  "decision",
  "lesson",
  "playbook",
  "reference",
  "project",
  "inbox",
  "other",
]);

export const skillStatusSchema = z.enum(["adopted", "draft", "proposed"]);

export const contextManifestEntrySchema = z
  .object({
    id: z.string().min(1),
    kind: contextKindSchema.optional(),
    // `type` is the original v0 field. Keep accepting it so older installs stay valid.
    type: z.enum(["rule", "doc", "skill"]).optional(),
    path: z.string().min(1),
    memory_type: memoryTypeSchema.optional(),
    skill_status: skillStatusSchema.optional(),
    activation: contextActivationSchema,
    budget: z.object({
      max_tokens: z.number().int().positive(),
    }),
  })
  .superRefine((entry, context) => {
    if (!entry.kind && !entry.type) {
      context.addIssue({
        code: "custom",
        message: "Context entries must provide kind or legacy type.",
        path: ["kind"],
      });
    }
  });

export const contextManifestSchema = z.object({
  schema_version: schemaVersionSchema,
  context: z.array(contextManifestEntrySchema),
});

export type ContextManifest = z.infer<typeof contextManifestSchema>;
export type ContextManifestEntry = z.infer<typeof contextManifestEntrySchema>;
export type ContextKind = z.infer<typeof contextKindSchema>;
export type ContextActivation = z.infer<typeof contextActivationSchema>;
export type MemoryType = z.infer<typeof memoryTypeSchema>;
export type SkillStatus = z.infer<typeof skillStatusSchema>;
