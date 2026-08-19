import assert from "node:assert/strict";
import test from "node:test";
import { compileRuntime, evaluateVisualContinuity, proposeMutation, verifyEffects } from "./compiler.js";

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
    evidence: [{ id: "source-photo", class: "observed", supports: ["identity"] }],
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

test("blocks rendering until visual recovery state exists", () => {
  const result = compileRuntime({
    objective: "put Monday into the train scene",
    requiredCapabilities: ["render-scene"],
    invariants: ["continuity"],
    stateFingerprint: "train-2026-08-19",
    organs: [{ id: "image-renderer", capabilities: ["render-scene"], available: true }],
    evidence: [{ id: "train-photo", class: "observed", supports: ["scene"] }],
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
