import { existsSync } from "node:fs";
import { join } from "node:path";

import type { RepoMap } from "../schemas/repo-map.js";

export function discoverDocs(cwd: string): RepoMap["docs"] {
  const docs: RepoMap["docs"] = [];

  if (existsSync(join(cwd, "README.md"))) {
    docs.push({ path: "README.md", authority: "high" });
  }
  if (existsSync(join(cwd, "docs"))) {
    docs.push({ path: "docs/", authority: "medium" });
  }
  if (existsSync(join(cwd, "prep-docs"))) {
    docs.push({ path: "prep-docs/", authority: "medium" });
  }

  return docs;
}
