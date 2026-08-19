import assert from "node:assert/strict";
import test from "node:test";
import {
  compileRuntime,
  evaluateContinuityProof,
  evaluateVisualContinuity,
  promoteCandidateState,
  proposeMutation,
  verifyEffects,
} from "./compiler.js";

const continuity = (ids: string[], parent = "state-t", candidate = "state-t1") => ({
  parentStateId: parent,
  candidateStateId: candidate,
  transfers: ids.map((id) => ({
    id,
    before: `${id}:before`,
    after: `${id}:after`,
    allowedChange: "bounded" as const,
    preserved: true,
    evidenceIds: [`evidence:${id}`],
  })),
});

const evidenceFor = (ids: string[]) =>
  ids.map((id) => ({
    id: `evidence:${id}`,
    class: "observed" as const,
    supports: [id],
  }));

test("selects organs from capabilities instead of handing them the raw objective", () => {
  const result = compileRuntime({
    objective: "preserve identity while changing scene",
    requiredCapabilities: ["inspect-visual-state", "render-scene"],
    invariants: ["identity", "single-frame"],
    stateFingerprint: "boss-photo-v1",
    organs: [
      { id: "vision", capabilities: ["inspect-visual-state"], available: true },
      { id: "image-renderer", capabilities: ["render-scene"], available: true },
    ],
    evidence: [
      { id: "source-photo", class: "observed", supports: ["identity"] },
      ...evidenceFor(["identity", "single-frame"]),
    ],
    continuityProof: continuity(["identity", "single-frame"]),
    visualState: {
      sceneSourceIds: ["source-photo"],
      activeIdentityReferenceId: "identity-seed-001",
      identityLineageVerified: true,
      recentWardrobeArchetypes: ["soft-skirt-train"],
      candidateWardrobeArchetype: "utility-summer-01",
      singleFrame: true,
      generatorIsRendererOnly: true,
      releaseAsMonday: true,
    },
  });

  assert.equal(result.status, "READY");
  assert.deepEqual(result.selectedOrgans, ["vision", "image-renderer"]);
  assert.ok(result.dispatches.every((dispatch) => !dispatch.operation.includes("preserve identity while changing scene")));
  assert.equal(result.proofRequired, true);
  assert.equal(result.falsificationRequired, true);
});

test("blocks any operation with invariants until continuity proof exists", () => {
  const result = compileRuntime({
    objective: "continue the same task in a new chat",
    requiredCapabilities: ["respond"],
    invariants: ["active-objective", "lineage"],
    stateFingerprint: "chat-transition-001",
    organs: [{ id: "host", capabilities: ["respond"], available: true }],
    evidence: [{ id: "current-message", class: "observed", supports: ["active-objective"] }],
  });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasons.includes("CONTINUITY_PROOF_REQUIRED"));
  assert.deepEqual(result.dispatches, []);
});

test("blocks rendering until visual recovery state exists", () => {
  const result = compileRuntime({
    objective: "put Monday into the train scene",
    requiredCapabilities: ["render-scene"],
    invariants: ["continuity"],
    stateFingerprint: "train-2026-08-19",
    organs: [{ id: "image-renderer", capabilities: ["render-scene"], available: true }],
    evidence: [
      { id: "train-photo", class: "observed", supports: ["scene"] },
      ...evidenceFor(["continuity"]),
    ],
    continuityProof: continuity(["continuity"]),
  });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasons.includes("VISUAL_RECOVERY_REQUIRED"));
  assert.equal(result.dispatches.some((d) => d.capability === "render-scene"), false);
});

test("blocks repeated wardrobe archetype even when the colors change", () => {
  const failures = evaluateVisualContinuity({
    sceneSourceIds: ["train-photo"],
    activeIdentityReferenceId: "monday-seed",
    identityLineageVerified: true,
    recentWardrobeArchetypes: ["fitted-top-plus-light-bottom", "shirt-over-fitted-top"],
    candidateWardrobeArchetype: "fitted-top-plus-light-bottom",
    singleFrame: true,
    generatorIsRendererOnly: true,
    releaseAsMonday: true,
  });

  assert.ok(failures.includes("VISUAL_WARDROBE_ARCHETYPE_REPEAT"));
});

test("refuses to release a generated blonde as Monday without identity lineage", () => {
  const failures = evaluateVisualContinuity({
    sceneSourceIds: ["train-photo"],
    recentWardrobeArchetypes: ["utility-summer-01"],
    candidateWardrobeArchetype: "asymmetric-street-01",
    identityLineageVerified: false,
    singleFrame: true,
    generatorIsRendererOnly: true,
    releaseAsMonday: true,
  });

  assert.ok(failures.includes("VISUAL_IDENTITY_REFERENCE_MISSING"));
  assert.ok(failures.includes("VISUAL_IDENTITY_LINEAGE_UNVERIFIED"));
});

test("one broken invariant blocks all downstream dispatch, not only its local organ", () => {
  const proof = continuity(["identity", "objective"]);
  proof.transfers[1].preserved = false;

  const result = compileRuntime({
    objective: "render a scene while preserving the current objective",
    requiredCapabilities: ["inspect-visual-state", "render-scene"],
    invariants: ["identity", "objective"],
    stateFingerprint: "cross-organ-resonance-001",
    organs: [
      { id: "vision", capabilities: ["inspect-visual-state"], available: true },
      { id: "renderer", capabilities: ["render-scene"], available: true },
    ],
    evidence: [
      { id: "message", class: "observed", supports: ["objective"] },
      ...evidenceFor(["identity", "objective"]),
    ],
    continuityProof: proof,
    visualState: {
      sceneSourceIds: ["scene"],
      activeIdentityReferenceId: "identity",
      identityLineageVerified: true,
      recentWardrobeArchetypes: ["previous"],
      candidateWardrobeArchetype: "new",
      singleFrame: true,
      generatorIsRendererOnly: true,
      releaseAsMonday: true,
    },
  });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasons.includes("INVARIANT_BROKEN:objective"));
  assert.deepEqual(result.dispatches, []);
});

test("forged evidence ids cannot self-certify continuity", () => {
  const proof = continuity(["identity", "objective"]);

  const result = compileRuntime({
    objective: "continue across organs",
    requiredCapabilities: ["respond"],
    invariants: ["identity", "objective"],
    stateFingerprint: "forged-proof-001",
    organs: [{ id: "host", capabilities: ["respond"], available: true }],
    evidence: [{ id: "unrelated-receipt", class: "receipt", supports: ["file-created"] }],
    continuityProof: proof,
  });

  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasons.includes("INVARIANT_EVIDENCE_UNVERIFIED:identity"));
  assert.ok(result.reasons.includes("INVARIANT_EVIDENCE_UNVERIFIED:objective"));
  assert.deepEqual(result.dispatches, []);
});

test("inferred evidence cannot promote an invariant transfer", () => {
  const proof = continuity(["lineage"]);
  const failures = evaluateContinuityProof(proof, ["lineage"], [
    { id: "evidence:lineage", class: "inferred", supports: ["lineage"] },
  ]);

  assert.ok(failures.includes("INVARIANT_EVIDENCE_UNVERIFIED:lineage"));
});

test("failed candidate cannot become the ancestor of the next state", () => {
  const proof = continuity(["identity", "active-objective"], "verified-parent", "bad-candidate");
  proof.transfers[0].preserved = false;

  const promotion = promoteCandidateState(
    proof,
    ["identity", "active-objective"],
    evidenceFor(["identity", "active-objective"]),
  );

  assert.equal(promotion.promoted, false);
  assert.equal(promotion.activeStateId, "verified-parent");
  assert.equal(promotion.rejectedCandidateStateId, "bad-candidate");
  assert.ok(promotion.reasons.includes("FAILED_STATE_DOES_NOT_BECOME_ANCESTOR"));
});

test("candidate becomes the new ancestor only after all required invariants are proven", () => {
  const promotion = promoteCandidateState(
    continuity(["identity", "active-objective"], "verified-parent", "good-candidate"),
    ["identity", "active-objective"],
    evidenceFor(["identity", "active-objective"]),
  );

  assert.equal(promotion.promoted, true);
  assert.equal(promotion.activeStateId, "good-candidate");
  assert.deepEqual(promotion.reasons, ["CONTINUITY_PROVEN"]);
});

test("continuity proof requires evidence for every invariant transfer", () => {
  const proof = continuity(["identity"]);
  proof.transfers[0].evidenceIds = [];

  const failures = evaluateContinuityProof(proof, ["identity"], evidenceFor(["identity"]));
  assert.ok(failures.includes("INVARIANT_EVIDENCE_MISSING:identity"));
});

test("turns a missing organ into an explicit capability gap", () => {
  const result = compileRuntime({
    objective: "perform unavailable world action",
    requiredCapabilities: ["world-write"],
    invariants: [],
    stateFingerprint: "gap-v1",
    organs: [],
    evidence: [{ id: "request", class: "observed", supports: ["objective"] }],
  });

  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(result.missingCapabilities, ["world-write"]);
  assert.ok(result.reasons.includes("CAPABILITY_GAP:world-write"));
});

test("verification refuses tool-success without evidence for the claimed effect", () => {
  const verdict = verifyEffects({
    claimedEffects: ["file-created", "deployment-live"],
    evidence: [{ id: "write-receipt", class: "receipt", supports: ["file-created"] }],
  });

  assert.equal(verdict.accepted, false);
  assert.deepEqual(verdict.unsupportedEffects, ["deployment-live"]);
});

test("correction creates a candidate, never an auto-promoted law", () => {
  const mutation = proposeMutation(
    "M_TOOL_DIRECTOR_001",
    "renderer reinterpreted the objective",
    "tools receive compiled operations; executive authority stays above organs",
    ["failure-scene", "corrected-scene"],
  );

  assert.equal(mutation.status, "CANDIDATE");
});
