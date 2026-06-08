export const terminalWords = {
  checks: "Suggested Checks",
  changeChecks: "Change Checks",
  contextLanding: "Where This Change Lands",
  finishGate: "Finish Gate",
  manualReview: "Manual Review",
  needsAttention: "Needs Attention",
  nextStep: "Next Step",
  proof: "Proof",
  routing: "How Greenhouse Chose Checks",
} as const;

export function terminalStatusLabel(status: "pass" | "degraded" | "fail"): string {
  if (status === "pass") {
    return "ready";
  }
  if (status === "degraded") {
    return "needs review";
  }
  return "blocked";
}
