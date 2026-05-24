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

  return {
    schema_version: 1,
    managed_by: "greenhouse-spec",
    generated_at: new Date().toISOString(),
    risks,
  };
}
