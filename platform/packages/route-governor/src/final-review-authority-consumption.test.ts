import test from "node:test";
import assert from "node:assert/strict";

import {
  consumeFinalReviewAuthority,
  type FinalReviewAuthorityConsumptionBundle,
  type FinalReviewAuthorityConsumptionInput,
  type FinalReviewAuthorityResultReceipt,
} from "./final-review-authority-consumption.js";

const branch = "monday-platform-genesis-01";
const head = "73a43533616123b8918bf3d4c5b52053cc635207";

function bundle(overrides: Partial<FinalReviewAuthorityConsumptionBundle> = {}): FinalReviewAuthorityConsumptionBundle {
  return {
    bundle_id: "final-review-authority-live-head-001",
    branch,
    head_sha: head,
    command: "merge_finalization",
    ok: true,
    blockers: [],
    evidence: ["status lease", "mergeability lease", "review lease", "blocker retirement lease"],
    ...overrides,
  };
}

function receipt(overrides: Partial<FinalReviewAuthorityResultReceipt> = {}): FinalReviewAuthorityResultReceipt {
  return {
    receipt_id: "merge-result-live-head-001",
    branch,
    head_sha: head,
    command: "merge_finalization",
    ok: true,
    evidence: ["merge command accepted for live head"],
    blockers: [],
    ...overrides,
  };
}

function input(overrides: Partial<FinalReviewAuthorityConsumptionInput> = {}): FinalReviewAuthorityConsumptionInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    consumption_id: "consume-final-review-authority-001",
    spent_consumption_ids: [],
    bundle: bundle(),
    command: "merge_finalization",
    result_receipt: receipt(),
    ...overrides,
  };
}

test("accepts one matching live-head final review authority consumption", () => {
  const verdict = consumeFinalReviewAuthority(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_authority_consumption");
  assert.equal(verdict.branch, branch);
  assert.equal(verdict.head_sha, head);
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.decisive_evidence.includes("merge-result-live-head-001"));
});

test("blocks reuse of a spent authority consumption id", () => {
  const verdict = consumeFinalReviewAuthority(input({ spent_consumption_ids: ["consume-final-review-authority-001"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_reused_consumption");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("already spent")));
});

test("blocks cross-command consumption of final review authority", () => {
  const verdict = consumeFinalReviewAuthority(input({ command: "request_final_review" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_command_mismatch");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("permits merge_finalization")));
});

test("blocks stale bundle heads before authority consumption", () => {
  const verdict = consumeFinalReviewAuthority(
    input({ bundle: bundle({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_wrong_head");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("not live head")));
});

test("blocks stale result receipt heads before authority consumption", () => {
  const verdict = consumeFinalReviewAuthority(
    input({ result_receipt: receipt({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }) }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_wrong_head");
  assert.ok(verdict.blockers.some((blocker) => blocker.includes("not live head")));
});

test("emits exact blocker only when exact-blocker authority names the blocker", () => {
  const admitted = consumeFinalReviewAuthority(
    input({
      bundle: bundle({ command: "exact_external_blocker" }),
      command: "exact_external_blocker",
      result_receipt: undefined,
      exact_blocker: "review authority cannot be consumed without a live-head reviewer surface",
    }),
  );

  assert.equal(admitted.ok, true);
  assert.equal(admitted.action, "emit_exact_external_blocker");
  assert.deepEqual(admitted.blockers, ["review authority cannot be consumed without a live-head reviewer surface"]);

  const blocked = consumeFinalReviewAuthority(
    input({
      bundle: bundle({ command: "exact_external_blocker" }),
      command: "exact_external_blocker",
      result_receipt: undefined,
    }),
  );

  assert.equal(blocked.ok, false);
  assert.equal(blocked.action, "block_missing_exact_blocker");
});
