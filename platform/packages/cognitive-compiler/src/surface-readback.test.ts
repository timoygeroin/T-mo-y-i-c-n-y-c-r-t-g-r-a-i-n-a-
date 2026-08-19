import assert from "node:assert/strict";
import test from "node:test";
import { evaluateContinuityProof, promoteCandidateState } from "./compiler.js";

const invariantEvidence = {
  id: "evidence:lineage",
  class: "receipt" as const,
  supports: ["lineage"],
};

const baseProof = () => ({
  parentStateId: "state-018",
  candidateStateId: "state-019",
  transfers: [
    {
      id: "lineage",
      before: "state-018",
      after: "state-019",
      allowedChange: "bounded" as const,
      preserved: true,
      evidenceIds: ["evidence:lineage"],
    },
  ],
  requiredSurfaceIds: ["airtable-canon", "production"],
  surfaceReadbacks: [
    {
      surfaceId: "airtable-canon",
      observedStateId: "state-019",
      evidenceIds: ["evidence:airtable"],
    },
    {
      surfaceId: "production",
      observedStateId: "state-019",
      evidenceIds: ["evidence:production"],
    },
  ],
});

const surfaceEvidence = [
  {
    id: "evidence:airtable",
    class: "observed" as const,
    supports: ["surface:airtable-canon:candidate-visible"],
  },
  {
    id: "evidence:production",
    class: "receipt" as const,
    supports: ["surface:production:candidate-visible"],
  },
];

test("blocks promotion when one required organism surface still exposes the parent phenotype", () => {
  const proof = baseProof();
  proof.surfaceReadbacks[1].observedStateId = "state-018";

  const promotion = promoteCandidateState(proof, ["lineage"], [
    invariantEvidence,
    ...surfaceEvidence,
  ]);

  assert.equal(promotion.promoted, false);
  assert.equal(promotion.activeStateId, "state-018");
  assert.ok(
    promotion.reasons.some((reason) =>
      reason.startsWith("SURFACE_STATE_DIVERGENCE:production:state-018:state-019"),
    ),
  );
});

test("surface self-report cannot certify convergence without grounded evidence", () => {
  const proof = baseProof();
  const failures = evaluateContinuityProof(proof, ["lineage"], [
    invariantEvidence,
    {
      id: "evidence:airtable",
      class: "inferred" as const,
      supports: ["surface:airtable-canon:candidate-visible"],
    },
    surfaceEvidence[1],
  ]);

  assert.ok(failures.includes("SURFACE_EVIDENCE_UNVERIFIED:airtable-canon"));
});

test("candidate can become an ancestor only after every required surface independently reads back the candidate", () => {
  const proof = baseProof();
  const promotion = promoteCandidateState(proof, ["lineage"], [
    invariantEvidence,
    ...surfaceEvidence,
  ]);

  assert.equal(promotion.promoted, true);
  assert.equal(promotion.activeStateId, "state-019");
  assert.ok(promotion.reasons.includes("REQUIRED_SURFACES_CONVERGED"));
});
