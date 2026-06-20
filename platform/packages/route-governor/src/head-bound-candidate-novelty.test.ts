import test from "node:test";
import assert from "node:assert/strict";

import {
  admitHeadBoundCandidateNovelty,
  type HeadBoundCandidateNoveltyInput,
} from "./head-bound-candidate-novelty.js";

const HEAD = "49cd7be930291796c5be1207332b929564b80384";

function input(overrides: Partial<HeadBoundCandidateNoveltyInput> = {}): HeadBoundCandidateNoveltyInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: HEAD,
    candidate_id: "head-bound-candidate-novelty",
    candidate_branch: "monday-platform-genesis-01",
    candidate_head_sha: HEAD,
    artifact_class: "head-bound-candidate-novelty-admission",
    move_class: "external_platform_embodiment",
    spent_artifact_classes: ["post-write-status-escrow", "review-feedback-delta-router", "release-candidate-bundle"],
    spent_move_classes: ["metadata_reread", "duplicate_ci_summary", "duplicate_comment"],
    changed_files: ["platform/packages/route-governor/src/head-bound-candidate-novelty.ts"],
    executable_behavior_exports: ["admitHeadBoundCandidateNovelty"],
    future_routing_effects: ["next embodiment candidates must be branch/head bound and artifact-novel before writing"],
    ...overrides,
  };
}

test("admits a head-bound executable candidate with a new artifact class", () => {
  const verdict = admitHeadBoundCandidateNovelty(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_head_bound_candidate");
  assert.equal(verdict.admitted_artifact_class, "head-bound-candidate-novelty-admission");
  assert.ok(verdict.decisive_evidence.includes("admitHeadBoundCandidateNovelty"));
});

test("blocks candidates prepared for a stale head", () => {
  const verdict = admitHeadBoundCandidateNovelty(input({ candidate_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_wrong_head");
  assert.match(verdict.blockers[0], /does not match live head/);
});

test("blocks spent artifact classes before another write", () => {
  const verdict = admitHeadBoundCandidateNovelty(
    input({ artifact_class: "post-write-status-escrow" }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_spent_artifact_class");
});

test("blocks explicit non-progress move classes", () => {
  const verdict = admitHeadBoundCandidateNovelty(input({ move_class: "duplicate_ci_summary" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_spent_move_class");
});

test("blocks candidates without executable platform behavior", () => {
  const verdict = admitHeadBoundCandidateNovelty(
    input({
      changed_files: ["platform/docs/finalization-note.md"],
      executable_behavior_exports: [],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_candidate");
  assert.ok(verdict.blockers.includes("candidate changes no executable platform package file"));
  assert.ok(verdict.blockers.includes("candidate exposes no executable behavior export"));
});
