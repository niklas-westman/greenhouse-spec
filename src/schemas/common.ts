import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const schemaVersionSchema = z.literal(1);

export const confidenceSchema = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof confidenceSchema>;

export const modeSchema = z.enum(["patch", "growth", "guarded"]);

export const commandCheckSchema = z.object({
  id: z.string().min(1),
  command: z.string().min(1),
});
export type CommandCheck = z.infer<typeof commandCheckSchema>;

export const manualCheckSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
});
export type ManualCheck = z.infer<typeof manualCheckSchema>;

export function parseYamlWithSchema<T>(
  source: string,
  schema: z.ZodType<T>,
): T {
  return schema.parse(parseYaml(source));
}
