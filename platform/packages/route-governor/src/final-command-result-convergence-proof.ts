import assert from "node:assert/strict";

import {
  convergeFinalCommandResult,
  type FinalCommandResultConvergenceInput,
} from "./final-command-result-convergence.js";

const branch = "monday-platform-genesis-01";
const head = "c8393fb6e4850548a1f4d13deab29dcb2441bfea";

const admittedReview: FinalCommandResultConvergenceInput = {
  active_branch: branch,
  live_head_sha: head,
  convergence_id: "final-command-result-proof-review-001",
  spent_convergence_ids: [],
  requested_action: "request_final_review",
  result_receipts: [
    {
      receipt_id: "review-request-result-proof-001",
      kind: "review_request_result",
      branch,
      head_sha: head,
      ok: true,
      external_result_id: "github-review-request-result-proof-001",
      evidence: ["review request API result matched admitted command targets"],
      blockers: [],
    },
  ],
};

const reviewVerdict = convergeFinalCommandResult(admittedReview);
assert.equal(reviewVerdict.ok, true);
assert.equal(reviewVerdict.action, "converge_review_request_result");

const commandEcho = convergeFinalCommandResult({
  ...admittedReview,
  convergence_id: "final-command-result-proof-echo-001",
  requested_action: "command_echo",
});
assert.equal(commandEcho.ok, false);
assert.equal(commandEcho.action, "block_non_progress_action");

const mergeVerdict = convergeFinalCommandResult({
  active_branch: branch,
  live_head_sha: head,
  convergence_id: "final-command-result-proof-merge-001",
  spent_convergence_ids: [],
  requested_action: "merge_finalization",
  result_receipts: [
    {
      receipt_id: "merge-result-proof-001",
      kind: "merge_result",
      branch,
      head_sha: head,
      ok: true,
      external_result_id: "github-merge-result-proof-001",
      evidence: ["GitHub merge result returned merged=true"],
      blockers: [],
      merge_commit_sha: "93472183d4faa3d94472b9daaac1bccd579a3742",
    },
  ],
});
assert.equal(mergeVerdict.ok, true);
assert.equal(mergeVerdict.action, "converge_merge_result");
