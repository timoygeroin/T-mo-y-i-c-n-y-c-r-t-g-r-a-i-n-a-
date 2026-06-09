import assert from "node:assert/strict";

import {
  compileEmbodimentCompletionReceipt,
  type EmbodimentCompletionReceiptInput,
} from "./embodiment-completion-receipt.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const branch = "monday-platform-genesis-01";
const previousHead = "11057f67da52b7df34615fa92475b4eedf768315";
const newHead = "957b0d3e467f8e7848bf8334f2cf1fd1cbcb86d6";

function input(overrides: Partial<EmbodimentCompletionReceiptInput> = {}): EmbodimentCompletionReceiptInput {
  return {
    repository,
    pr_number: 2,
    branch,
    active_branch: branch,
    previous_head_sha: previousHead,
    new_head_sha: newHead,
    artifact_class: "embodiment-completion-receipt",
    spent_artifact_classes: [
      "status-to-embodiment-handoff",
      "embodiment-progression-contract",
      "capability-frontier-admission",
    ],
    committed_files: [
      "platform/packages/route-governor/src/embodiment-completion-receipt.ts",
      "platform/packages/route-governor/src/embodiment-completion-receipt-proof.ts",
    ],
    executable_artifacts: ["compileEmbodimentCompletionReceipt"],
    routing_artifacts: ["completion accepts executable embodiment while requiring a later new-head status cursor"],
    proof_artifacts: ["dist/embodiment-completion-receipt-proof.js"],
    status_claim: "none",
    ...overrides,
  };
}

const accepted = compileEmbodimentCompletionReceipt(input());
assert.equal(accepted.ok, true);
assert.equal(accepted.action, "accept_completion_receipt");
assert.match(accepted.next_route, /new PR head/);
assert.ok(accepted.decisive_evidence.includes("no status claim made before new-head readback"));

const branchMismatch = compileEmbodimentCompletionReceipt(input({ branch: "main" }));
assert.equal(branchMismatch.ok, false);
assert.equal(branchMismatch.action, "block_branch_mismatch");

const unmovedHead = compileEmbodimentCompletionReceipt(input({ new_head_sha: previousHead }));
assert.equal(unmovedHead.ok, false);
assert.equal(unmovedHead.action, "block_no_head_move");

const repeatedClass = compileEmbodimentCompletionReceipt(
  input({ spent_artifact_classes: ["embodiment-completion-receipt"] }),
);
assert.equal(repeatedClass.ok, false);
assert.equal(repeatedClass.action, "block_repeated_artifact_class");

const missingProof = compileEmbodimentCompletionReceipt(input({ proof_artifacts: [] }));
assert.equal(missingProof.ok, false);
assert.equal(missingProof.action, "block_incomplete_receipt");
assert.deepEqual(missingProof.blockers, ["completion receipt has no proof artifact evidence"]);

const unboundStatusClaim = compileEmbodimentCompletionReceipt(input({ status_claim: "passing_with_warnings" }));
assert.equal(unboundStatusClaim.ok, false);
assert.equal(unboundStatusClaim.action, "block_unbound_status_claim");
assert.deepEqual(unboundStatusClaim.blockers, [
  `status claim passing_with_warnings has no readback bound to new head ${newHead}`,
]);

const boundStatusClaim = compileEmbodimentCompletionReceipt(
  input({ status_claim: "passing", status_readback_head_sha: newHead }),
);
assert.equal(boundStatusClaim.ok, true);
assert.ok(boundStatusClaim.decisive_evidence.includes(`status passing bound to ${newHead}`));

console.log("embodiment completion receipt proof passed");
