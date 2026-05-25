import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseYamlWithSchema } from "../schemas/common.js";
import { docsRootSchema, type DocsRoot } from "../schemas/docs-root.js";

export function readDocsRoot(cwd: string): DocsRoot | undefined {
  const path = join(cwd, ".greenhouse", "roots", "docs.yaml");
  if (!existsSync(path)) {
    return undefined;
  }

  return parseYamlWithSchema(readFileSync(path, "utf8"), docsRootSchema);
}
