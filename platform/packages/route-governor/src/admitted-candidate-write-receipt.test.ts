import test from "node:test";
import assert from "node:assert/strict";

import {
  compileAdmittedCandidateWriteReceipt,
  type AdmittedCandidateWriteReceiptInput,
} from "./admitted-candidate-write-receipt.js";
import {
  admitHeadBoundCandidateNovelty,
  type HeadBoundCandidateNoveltyInput,
} from "./head-bound-candidate-novelty.js";

const BASE_HEAD = "0709ddad42b0f4abfc48e91d7b26355e5ecf7d89";
const RESULT_HEAD = "6e6db96a6c5dba0987b40489184e14569ab94f1e";

function admissionInput(overrides: Partial<HeadBoundCandidateNoveltyInput> = {}): HeadBoundCandidateNoveltyInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: BASE_HEAD,
    candidate_id: "admitted-candidate-write-receipt",
    candidate_branch: "monday-platform-genesis-01",
    candidate_head_sha: BASE_HEAD,
    artifact_class: "admitted-candidate-write-receipt",
    move_class: "external_platform_embodiment",
    spent_artifact_classes: ["head-bound-candidate-novelty-admission"],
    spent_move_classes: ["metadata_reread", "duplicate_ci_summary", "duplicate_comment"],
    changed_files: ["platform/packages/route-governor/src/admitted-candidate-write-receipt.ts"],
    executable_behavior_exports: ["compileAdmittedCandidateWriteReceipt"],
    future_routing_effects: ["written candidates must open post-write status escrow on the resulting head"],
    ...overrides,
  };
}

function receiptInput(overrides: Partial<AdmittedCandidateWriteReceiptInput> = {}): AdmittedCandidateWriteReceiptInput {
  return {
    active_branch: "monday-platform-genesis-01",
    admission: admitHeadBoundCandidateNovelty(admissionInput()),
    write_receipt_id: "admitted-candidate-write-receipt-001",
    write_base_head_sha: BASE_HEAD,
    resulting_head_sha: RESULT_HEAD,
    artifact_class: "admitted-candidate-write-receipt",
    changed_files: ["platform/packages/route-governor/src/admitted-candidate-write-receipt.ts"],
    behavior_artifacts: ["compileAdmittedCandidateWriteReceipt"],
    routing_artifacts: ["post-write status escrow must consume the resulting head"],
    ...overrides,
  };
}

test("accepts a moved-head write that consumed the admitted artifact", () => {
  const verdict = compileAdmittedCandidateWriteReceipt(receiptInput());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_admitted_candidate_write");
  assert.equal(verdict.base_head_sha, BASE_HEAD);
  assert.equal(verdict.resulting_head_sha, RESULT_HEAD);
  assert.match(verdict.next_route, /post-write status escrow/);
});

test("blocks writes that were not admitted", () => {
  const rejectedAdmission = admitHeadBoundCandidateNovelty(
    admissionInput({ candidate_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
  );
  const verdict = compileAdmittedCandidateWriteReceipt(receiptInput({ admission: rejectedAdmission }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unadmitted_candidate");
});

test("blocks stale write receipts whose base head differs from admission", () => {
  const verdict = compileAdmittedCandidateWriteReceipt(
    receiptInput({ write_base_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_wrong_base_head");
});

test("blocks admitted writes that did not move the branch", () => {
  const verdict = compileAdmittedCandidateWriteReceipt(receiptInput({ resulting_head_sha: BASE_HEAD }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unmoved_write");
});

test("blocks writes that swap the admitted artifact class", () => {
  const verdict = compileAdmittedCandidateWriteReceipt(receiptInput({ artifact_class: "duplicate-ci-summary" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_artifact_mismatch");
});

test("blocks proof-only writes without behavior-bearing receipts", () => {
  const verdict = compileAdmittedCandidateWriteReceipt(
    receiptInput({
      changed_files: ["platform/packages/route-governor/src/admitted-candidate-write-receipt-proof.ts"],
      behavior_artifacts: [],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_behavior_receipt");
});

test("blocks writes that do not name a future-routing artifact", () => {
  const verdict = compileAdmittedCandidateWriteReceipt(receiptInput({ routing_artifacts: [] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_routing_receipt");
});
