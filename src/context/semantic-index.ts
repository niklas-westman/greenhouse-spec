import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseYamlWithSchema } from "../schemas/common.js";
import type { ContextManifest } from "../schemas/context-manifest.js";
import { semanticIndexSchema, type SemanticIndexMatch } from "../schemas/semantic-index.js";

export type SemanticRetrievalResult = {
  enabled: boolean;
  indexPath: string;
  matches: SemanticIndexMatch[];
  note: string | null;
};

export function readSemanticRetrieval(options: {
  cwd: string;
  manifest: ContextManifest;
  task: string;
  requested?: boolean;
}): SemanticRetrievalResult {
  const config = options.manifest.retrieval?.semantic;
  const indexPath = config?.index_path ?? ".greenhouse/grown/semantic-index.yaml";

  if (!options.requested) {
    return {
      enabled: false,
      indexPath,
      matches: [],
      note: null,
    };
  }

  if (!config?.enabled) {
    return {
      enabled: false,
      indexPath,
      matches: [],
      note:
        "Semantic retrieval was requested, but it is not enabled in .greenhouse/context/manifest.yaml. Lexical retrieval was used.",
    };
  }

  const absolutePath = join(options.cwd, indexPath);
  if (!existsSync(absolutePath)) {
    return {
      enabled: true,
      indexPath,
      matches: [],
      note: `Semantic retrieval was enabled, but ${indexPath} does not exist. Lexical retrieval was used.`,
    };
  }

  const index = parseYamlWithSchema(
    readFileSync(absolutePath, "utf8"),
    semanticIndexSchema,
  );
  const task = options.task.toLowerCase();
  const matches = index.matches.filter(
    (match) =>
      match.query_hints.length === 0 ||
      match.query_hints.some((hint) => task.includes(hint.toLowerCase())),
  );

  return {
    enabled: true,
    indexPath,
    matches,
    note:
      matches.length === 0
        ? "Semantic retrieval index was read, but no source-backed semantic candidates matched the task."
        : null,
  };
}
