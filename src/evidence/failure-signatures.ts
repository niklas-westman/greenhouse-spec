import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

import { stringify as stringifyYaml } from "yaml";

import { parseYamlWithSchema } from "../schemas/common.js";
import {
  failureSignaturesSchema,
  type FailureSignatures,
} from "../schemas/failure-signatures.js";
import type { CommandExecutionResult } from "../validation/run-command.js";

export type FailureAnnotation = {
  command: string;
  signatureId: string;
  previousCount: number;
  message: string;
};

type FailureObservation = {
  command: string;
  normalizedFailure: string;
  evidencePath: string;
  seenAt: string;
};

const recentEvidenceLimit = 20;

export function writeFailureSignatures(cwd: string): string {
  const indexPath = join(cwd, ".greenhouse", "grown", "failure-signatures.yaml");
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(
    indexPath,
    stringifyYaml(buildFailureSignatures(cwd), { lineWidth: 0 }),
    "utf8",
  );
  return indexPath;
}

export function buildFailureSignatures(cwd: string): FailureSignatures {
  const observations = readFailureObservations(cwd);
  const grouped = new Map<string, FailureObservation[]>();

  for (const observation of observations) {
    const key = signatureKey(observation.command, observation.normalizedFailure);
    grouped.set(key, [...(grouped.get(key) ?? []), observation]);
  }

  const signatures = [...grouped.entries()]
    .map(([key, items]) => {
      const sorted = [...items].sort((left, right) =>
        left.seenAt.localeCompare(right.seenAt),
      );
      const latest = sorted.at(-1) ?? sorted[0];
      return {
        id: `failure:${key}`,
        command: sorted[0].command,
        normalized_failure: sorted[0].normalizedFailure,
        count: sorted.length,
        first_seen_at: sorted[0].seenAt,
        last_seen_at: latest.seenAt,
        evidence_paths: sorted.map((item) => item.evidencePath),
      };
    })
    .sort((left, right) => {
      const count = right.count - left.count;
      return count === 0 ? right.last_seen_at.localeCompare(left.last_seen_at) : count;
    });

  return {
    schema_version: 1,
    managed_by: "greenhouse-spec",
    generated_at: new Date().toISOString(),
    policy: {
      effect:
        "Generated observations only. Matching failures must still fail validation.",
    },
    signatures,
  };
}

export function readFailureSignatures(cwd: string): FailureSignatures {
  const indexPath = join(cwd, ".greenhouse", "grown", "failure-signatures.yaml");

  if (!existsSync(indexPath)) {
    return emptyFailureSignatures();
  }

  return parseYamlWithSchema(
    readFileSync(indexPath, "utf8"),
    failureSignaturesSchema,
  );
}

export function annotateRepeatedFailures(options: {
  cwd: string;
  commandResults: CommandExecutionResult[];
}): FailureAnnotation[] {
  const index = readFailureSignatures(options.cwd);
  const annotations: FailureAnnotation[] = [];

  for (const result of options.commandResults) {
    if (result.result !== "fail") {
      continue;
    }

    const normalizedFailure = normalizeFailureText(failureExcerpt(result.output));
    const signature = index.signatures.find(
      (item) =>
        item.command === result.command &&
        item.normalized_failure === normalizedFailure &&
        item.count > 0,
    );

    if (!signature) {
      continue;
    }

    annotations.push({
      command: result.command,
      signatureId: signature.id,
      previousCount: signature.count,
      message: `Repeated failure observed; command still failed. Seen in ${signature.count} previous evidence record${signature.count === 1 ? "" : "s"}.`,
    });
  }

  return annotations;
}

export function repeatedFailureSummaries(
  signatures: FailureSignatures,
): Array<{
  id: string;
  command: string;
  count: number;
  normalizedFailure: string;
  lastSeenAt: string;
}> {
  return signatures.signatures
    .filter((signature) => signature.count >= 2)
    .map((signature) => ({
      id: signature.id,
      command: signature.command,
      count: signature.count,
      normalizedFailure: signature.normalized_failure,
      lastSeenAt: signature.last_seen_at,
    }));
}

export function failureExcerpt(output: string): string {
  const clean = redactSensitiveOutput(stripAnsi(output))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const signal = clean.filter((line) =>
    /\b(typeerror|referenceerror|syntaxerror|assertionerror|error:|failed|failure|exception|not a function|cannot|expected|received)\b/i.test(
      line,
    ),
  );
  const selected = signal.length > 0 ? signal : clean;

  return selected.slice(0, 8).join(" ").replace(/\|/g, "\\|").slice(0, 500);
}

export function normalizeFailureText(text: string): string {
  const normalized = stripAnsi(text)
    .replace(/\/Users\/[^\s|]+/g, "<path>")
    .replace(/\/private\/[^\s|]+/g, "<path>")
    .replace(/\b\d{4}-\d{2}-\d{2}T[^\s|]+/g, "<timestamp>")
    .replace(/\b\d+(?:\.\d+)?\s?(ms|s)\b/gi, "<duration>")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const signal =
    normalized.match(/[a-z0-9_.]+\s+is not a function/)?.[0] ??
    normalized.match(
      /\b(typeerror|referenceerror|syntaxerror|assertionerror):\s*([^|]+)/,
    )?.[0] ??
    normalized.match(/\bcannot\s+[^|]+/)?.[0] ??
    normalized.match(/\bexpected\s+[^|]+/)?.[0];

  return (signal ?? normalized).trim().slice(0, 500);
}

export function isLowSignalFailureText(normalizedFailure: string): boolean {
  const text = normalizedFailure.trim().toLowerCase();
  if (text.length === 0) {
    return true;
  }

  const hasPreciseSignal =
    /\b(typeerror|referenceerror|syntaxerror|assertionerror):/.test(text) ||
    /\bis not a function\b/.test(text) ||
    /\bcannot\s+\w+/.test(text) ||
    /\bexpected\s+.+\breceived\b/.test(text);

  if (hasPreciseSignal) {
    return false;
  }

  return (
    text.startsWith("> ") ||
    /\b(vitest|jest|playwright|tsc|eslint)\s+(run|test|check)\b/.test(text) ||
    /^[✓✕×⨯]\s/.test(text)
  );
}

function readFailureObservations(cwd: string): FailureObservation[] {
  return recentEvidenceFiles(cwd).flatMap((path) => {
    const content = readFileSync(path, "utf8");
    const modifiedAt = new Date(statSync(path).mtimeMs).toISOString();
    const evidencePath = relative(join(cwd, ".greenhouse"), path).replace(/\\/g, "/");

    return parseFailedCommandRows(content)
      .map((row) => ({
        command: row.command,
        normalizedFailure: normalizeFailureText(row.notes),
        evidencePath,
        seenAt: modifiedAt,
      }))
      .filter(
        (observation) =>
          !isLowSignalFailureText(observation.normalizedFailure),
      );
  });
}

function parseFailedCommandRows(content: string): Array<{
  command: string;
  notes: string;
}> {
  return content
    .split("\n")
    .map((line) => line.match(/^\|\s*`([^`]+)`\s*\|\s*fail\s*\|\s*(.*?)\s*\|$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      command: match[1],
      notes: match[2].replace(/\\\|/g, "|"),
    }))
    .filter((row) => row.notes.trim().length > 0);
}

function recentEvidenceFiles(cwd: string): string[] {
  const evidencePath = join(cwd, ".greenhouse", "evidence");
  if (!existsSync(evidencePath)) {
    return [];
  }

  return readdirSync(evidencePath)
    .filter((file) => file.endsWith(".md"))
    .map((file) => join(evidencePath, file))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)
    .slice(0, recentEvidenceLimit);
}

function signatureKey(command: string, normalizedFailure: string): string {
  return createHash("sha1")
    .update(`${command}\0${normalizedFailure}`)
    .digest("hex")
    .slice(0, 12);
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function redactSensitiveOutput(value: string): string {
  return value
    .replace(/\/Users\/[^\s|]+/g, "<path>")
    .replace(/\/private\/[^\s|]+/g, "<path>")
    .replace(/\b[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|KEY)=([^\s|]+)/gi, "$1=<redacted>")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "<redacted-token>");
}

function emptyFailureSignatures(): FailureSignatures {
  return {
    schema_version: 1,
    managed_by: "greenhouse-spec",
    generated_at: new Date().toISOString(),
    policy: {
      effect:
        "Generated observations only. Matching failures must still fail validation.",
    },
    signatures: [],
  };
}
