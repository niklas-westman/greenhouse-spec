import { existsSync } from "node:fs";
import { join } from "node:path";

export type RiskIndex = {
  schema_version: 1;
  managed_by: "greenhouse-spec";
  generated_at: string;
  risks: Array<{
    id: string;
    paths: string[];
    reason: string;
    confidence: "low" | "medium" | "high";
  }>;
};

export function discoverRiskIndex(cwd: string): RiskIndex {
  const risks: RiskIndex["risks"] = [];

  if (existsSync(join(cwd, "src/engine/sru"))) {
    risks.push({
      id: "generated-output-contract",
      paths: ["src/engine/sru/**"],
      reason: "SRU export code can affect generated declaration output.",
      confidence: "medium",
    });
  }

  if (existsSync(join(cwd, "src/engine/sources"))) {
    risks.push({
      id: "official-source-change",
      paths: ["src/engine/sources/**"],
      reason: "Official source registry code can affect source freshness, binding, and traceability.",
      confidence: "medium",
    });
  }

  if (existsSync(join(cwd, "src/engine/tax"))) {
    risks.push({
      id: "financial-calculation",
      paths: ["src/engine/tax/**"],
      reason: "Tax engine code can affect financial calculations.",
      confidence: "medium",
    });
  }

  if (existsSync(join(cwd, "src/engine/annual-report"))) {
    risks.push({
      id: "financial-reporting-output",
      paths: ["src/engine/annual-report/**"],
      reason: "Annual report code can affect financial reporting output.",
      confidence: "medium",
    });
  }

  if (existsSync(join(cwd, "src/engine/closeout"))) {
    risks.push({
      id: "closeout-output-contract",
      paths: ["src/engine/closeout/**"],
      reason: "Closeout code can affect generated review or declaration output contracts.",
      confidence: "medium",
    });
  }

  if (existsSync(join(cwd, "src/engine/validation"))) {
    risks.push({
      id: "readiness-gate-contract",
      paths: ["src/engine/validation/**"],
      reason: "Readiness gate code can affect whether declarations are safe to produce.",
      confidence: "medium",
    });
  }

  if (existsSync(join(cwd, "src/shared/schemas"))) {
    risks.push({
      id: "shared-schema-contract",
      paths: ["src/shared/schemas/**"],
      reason: "Shared schemas can affect validation and output compatibility across repo areas.",
      confidence: "medium",
    });
  }

  return {
    schema_version: 1,
    managed_by: "greenhouse-spec",
    generated_at: new Date().toISOString(),
    risks,
  };
}
