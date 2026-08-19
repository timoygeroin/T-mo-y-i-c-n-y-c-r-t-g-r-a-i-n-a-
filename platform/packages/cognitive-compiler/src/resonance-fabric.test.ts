import assert from "node:assert/strict";
import test from "node:test";
import { compileResonanceDecision } from "./resonance-fabric.js";

test("acts without forcing one interpretation when one reversible action is valid across meanings", () => {
  const result = compileResonanceDecision({
    signals: [
      { id: "current", source: "chat", meaning: "continue", confidence: "observed", supports: ["continuity"] },
      { id: "lineage", source: "archive", meaning: "recover older mechanism", confidence: "filed", supports: ["continuity"] },
    ],
    hypotheses: [
      { id: "h1", statement: "continue current scene", invariantIds: ["continuity"], supportingSignalIds: ["current"], conflictingSignalIds: [], score: 0 },
      { id: "h2", statement: "recover older mechanism then continue", invariantIds: ["continuity"], supportingSignalIds: ["lineage"], conflictingSignalIds: [], score: 0 },
    ],
    candidateActions: [
      { id: "a1", description: "recover relevant continuity and preserve current scene", preservesInvariantIds: ["continuity"], validUnderHypothesisIds: ["h1", "h2"], reversible: true, requiresClarification: false },
    ],
    requiredInvariantIds: ["continuity"],
  });

  assert.equal(result.status, "ACT");
  assert.equal(result.selectedAction?.id, "a1");
  assert.ok(result.reasons.includes("AMBIGUITY_PRESERVED"));
});

test("asks only when ambiguity changes the available action", () => {
  const result = compileResonanceDecision({
    signals: [
      { id: "s1", source: "chat", meaning: "meaning one", confidence: "observed", supports: ["objective"] },
      { id: "s2", source: "history", meaning: "meaning two", confidence: "observed", supports: ["objective"] },
    ],
    hypotheses: [
      { id: "h1", statement: "one", invariantIds: ["objective"], supportingSignalIds: ["s1"], conflictingSignalIds: [], score: 0 },
      { id: "h2", statement: "two", invariantIds: ["objective"], supportingSignalIds: ["s2"], conflictingSignalIds: [], score: 0 },
    ],
    candidateActions: [
      { id: "a1", description: "only valid for h1", preservesInvariantIds: ["objective"], validUnderHypothesisIds: ["h1"], reversible: true, requiresClarification: false },
    ],
    requiredInvariantIds: ["objective"],
  });

  assert.equal(result.status, "CLARIFY");
  assert.ok(result.reasons.includes("AMBIGUITY_MATTERS_TO_ACTION"));
});
