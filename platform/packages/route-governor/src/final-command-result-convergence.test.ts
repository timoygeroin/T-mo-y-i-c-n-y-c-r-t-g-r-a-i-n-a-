import assert from "node:assert/strict";
import test from "node:test";

import {
  convergeFinalCommandResult,
  type FinalCommandResultConvergenceInput,
  type FinalCommandResultReceipt,
} from "./final-command-result-convergence.js";

const branch = "monday-platform-genesis-01";
const head = "c8393fb6e4850548a1f4d13deab29dcb2441bfea";

function receipt(overrides: Partial<FinalCommandResultReceipt> = {}): FinalCommandResultReceipt {
  return {
    receipt_id: "review-result-live-head-001",
    kind: "review_request_result",
    branch,
    head_sha: head,
    ok: true,
    external_result_id: "github-review-request-result-123",
    evidence: ["requested reviewer set matched command target"],
    blockers: [],
    ...overrides,
  };
}

function input(overrides: Partial<FinalCommandResultConvergenceInput> = {}): FinalCommandResultConvergenceInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    convergence_id: "final-command-result-live-head-001",
    spent_convergence_ids: [],
    requested_action: "request_final_review",
    result_receipts: [receipt()],
    ...overrides,
  };
}

test("converges a live-head review request result receipt", () => {
  const verdict = convergeFinalCommandResult(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "converge_review_request_result");
  assert.deepEqual(verdict.admitted_receipt_ids, ["review-result-live-head-001"]);
  assert.match(verdict.next_route, /reviewer response/);
});

test("converges a merge result only with a merge commit SHA", () => {
  const verdict = convergeFinalCommandResult(
    input({
      requested_action: "merge_finalization",
      result_receipts: [
        receipt({
          receipt_id: "merge-result-live-head-001",
          kind: "merge_result",
          external_result_id: "github-merge-result-456",
          merge_commit_sha: "93472183d4faa3d94472b9daaac1bccd579a3742",
          evidence: ["GitHub merge result returned merged=true"],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "converge_merge_result");
  assert.match(verdict.decisive_evidence.join("\n"), /merge commit/);
});

test("blocks command echo as final command progress", () => {
  const verdict = convergeFinalCommandResult(input({ requested_action: "command_echo" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_action");
});

test("blocks stale-head final command result receipts", () => {
  const verdict = convergeFinalCommandResult(
    input({
      result_receipts: [receipt({ head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" })],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_head_mismatch");
  assert.match(verdict.blockers.join("\n"), /not live head/);
});

test("blocks failed GitHub result receipts", () => {
  const verdict = convergeFinalCommandResult(
    input({
      result_receipts: [
        receipt({
          ok: false,
          blockers: ["GitHub rejected reviewer request with status 422"],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_failed_result_receipt");
  assert.deepEqual(verdict.blockers, ["GitHub rejected reviewer request with status 422"]);
});

test("blocks merge result receipts without merge commit SHA", () => {
  const verdict = convergeFinalCommandResult(
    input({
      requested_action: "merge_finalization",
      result_receipts: [
        receipt({
          receipt_id: "merge-result-live-head-001",
          kind: "merge_result",
          external_result_id: "github-merge-result-456",
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_merge_commit");
});
