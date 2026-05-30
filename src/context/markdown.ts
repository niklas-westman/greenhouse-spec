import { basename } from "node:path";

import { parse as parseYaml } from "yaml";

export type MarkdownDocument = {
  metadata: Record<string, unknown>;
  body: string;
};

export function parseMarkdownDocument(source: string): MarkdownDocument {
  if (!source.startsWith("---\n")) {
    return {
      metadata: {},
      body: source,
    };
  }

  const end = source.indexOf("\n---", 4);
  if (end === -1) {
    return {
      metadata: {},
      body: source,
    };
  }

  const rawMetadata = source.slice(4, end);
  const body = source.slice(end + 4).replace(/^\n/, "");

  try {
    const parsed = parseYaml(rawMetadata);
    return {
      metadata:
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {},
      body,
    };
  } catch {
    return {
      metadata: {},
      body: source,
    };
  }
}

export function markdownTitle(body: string, fallbackPath: string): string {
  const heading = body
    .split("\n")
    .find((line) => line.startsWith("# "))
    ?.replace(/^#\s+/, "")
    .trim();

  return heading || titleFromPath(fallbackPath);
}

export function markdownSummary(body: string, fallback = "No summary provided."): string {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("```"));
  const summary = lines.find((line) => !line.startsWith("- ") && !line.startsWith("|"));

  return (summary ?? fallback).replace(/\s+/g, " ").slice(0, 280);
}

export function stringMetadata(
  metadata: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function numberMetadata(
  metadata: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function stringArrayMetadata(
  metadata: Record<string, unknown>,
  key: string,
): string[] {
  const value = metadata[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

export function titleFromPath(path: string): string {
  return basename(path)
    .replace(/\.md$/i, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
