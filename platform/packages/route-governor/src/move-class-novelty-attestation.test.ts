import assert from "node:assert/strict";
import { test } from "node:test";

import {
  attestMoveClassNovelty,
  type MoveClassNoveltyCandidate,
  type MoveClassNoveltyInput,
  type SpentMoveClassReceipt,
} from "./move-class-novelty-attestation.js";

const branch = "monday-platform-genesis-01";
const head = "b19537f13ef90d3f06e074fd69fb74ba5c86b40f";

function candidate(overrides: Partial<MoveClassNoveltyCandidate> = {}): MoveClassNoveltyCandidate {
  return {
    candidate_id: "move-class-novelty-attestation",
    branch,
    base_head_sha: head,
    move_class: "external_platform_embodiment",
    artifact_class: "move_class_novelty_attestation",
    changed_files: ["platform/packages/route-governor/src/move-class-novelty-attestation.ts"],
    executable_artifacts: ["attestMoveClassNovelty"],
    routing_artifacts: ["spent move class attestation before terminal release"],
    novelty_vectors: ["behavior_surface", "routing_consequence"],
    novelty_claim: "requires a fresh behavior-bearing novelty vector before a continuation can count as non-repeated",
    ...overrides,
  };
}

function prior(overrides: Partial<SpentMoveClassReceipt> = {}): SpentMoveClassReceipt {
  return {
    receipt_id: "prior-finalization-release-mux",
    head_sha: "a238cc9567cca63ddb22701ffcd3cb3f17732d5b",
    move_class: "external_platform_embodiment",
    artifact_class: "finalization_release_mux",
    novelty_vectors: ["release_geometry"],
    behavior_files: ["platform/packages/route-governor/src/finalization-release-mux.ts"],
    routing_artifacts: ["terminal release mux"],
    ...overrides,
  };
}

function input(overrides: Partial<MoveClassNoveltyInput> = {}): MoveClassNoveltyInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    spent_move_classes: [],
    spent_artifact_classes: [],
    prior_receipts: [prior()],
    candidate: candidate(),
    ...overrides,
  };
}

test("admits a behavior-bearing novelty vector that does not replay prior receipts", () => {
  const verdict = attestMoveClassNovelty(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_novel_move_class");
  assert.ok(verdict.decisive_evidence.includes("behavior_surface"));
  assert.ok(verdict.decisive_evidence.includes("attestMoveClassNovelty"));
});

test("blocks stale-base novelty claims", () => {
  const verdict = attestMoveClassNovelty(input({ candidate: candidate({ base_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_base_head");
  assert.deepEqual(verdict.blockers, [
    `candidate base b38ea247602ae8ebba80c4120ad03b41b26bd841 is not live head ${head}`,
  ]);
});

test("blocks proof-only novelty claims", () => {
  const verdict = attestMoveClassNovelty(
    input({
      candidate: candidate({
        changed_files: ["platform/packages/route-governor/src/move-class-novelty-attestation-proof.ts"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_proof_only_novelty");
  assert.ok(verdict.blockers.includes("novelty candidate is proof-only and has no behavior-bearing executable file"));
});

test("blocks missing novelty vectors before release", () => {
  const verdict = attestMoveClassNovelty(input({ candidate: candidate({ novelty_vectors: [] }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_novelty_vector");
  assert.ok(verdict.blockers.includes("novelty candidate has no novelty vector"));
});

test("blocks spent move and artifact classes", () => {
  const spentMove = attestMoveClassNovelty(input({ spent_move_classes: ["external_platform_embodiment"] }));
  const spentArtifact = attestMoveClassNovelty(input({ spent_artifact_classes: ["move_class_novelty_attestation"] }));

  assert.equal(spentMove.ok, false);
  assert.equal(spentMove.action, "block_spent_move_class");
  assert.deepEqual(spentMove.blockers, ["move class is already spent: external_platform_embodiment"]);
  assert.equal(spentArtifact.ok, false);
  assert.deepEqual(spentArtifact.blockers, ["artifact class is already spent: move_class_novelty_attestation"]);
});

test("blocks a repeated novelty surface under a new receipt label", () => {
  const repeated = prior({
    receipt_id: "prior-novelty-attestation",
    artifact_class: "move_class_novelty_attestation",
    novelty_vectors: ["behavior_surface", "routing_consequence"],
    behavior_files: ["platform/packages/route-governor/src/move-class-novelty-attestation.ts"],
    routing_artifacts: ["spent move class attestation before terminal release"],
  });

  const verdict = attestMoveClassNovelty(input({ prior_receipts: [repeated] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_spent_move_class");
  assert.deepEqual(verdict.blockers, ["candidate repeats prior novelty surface from receipt prior-novelty-attestation"]);
});
