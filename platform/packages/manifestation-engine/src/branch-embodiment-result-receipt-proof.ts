import assert from "node:assert/strict";

import { acceptBranchEmbodimentResultReceipt } from "./branch-embodiment-result-receipt.js";

const branch = "monday-platform-genesis-01";
const baseHead = "4fbd48ca4539986c874f85394188c405b8d25600";
const resultHead = "58a12b4c8fd93777c1f6c6cde8bb0f991ab42109";
const writeId = "branch-embodiment-result-receipt";

const accepted = acceptBranchEmbodimentResultReceipt({
  write_id: writeId,
  admitted_write_ids: [writeId],
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  branch,
  pr_state: "closed",
  merged: true,
  base_head_sha: baseHead,
  result_head_sha: resultHead,
  status: "branch_write_executed",
  changed_files: ["platform/packages/manifestation-engine/src/branch-embodiment-result-receipt.ts"],
  behavior_exports: ["acceptBranchEmbodimentResultReceipt"],
  external_result_artifacts: [`branch ${branch}`, `head ${resultHead}`],
});
assert.equal(accepted.ok, true);
assert.equal(accepted.action, "accept_branch_embodiment_result");
assert.deepEqual(accepted.blockers, []);
assert.match(accepted.next_route, /moved branch head/);

const unmoved = acceptBranchEmbodimentResultReceipt({
  write_id: writeId,
  admitted_write_ids: [writeId],
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  branch,
  pr_state: "closed",
  merged: true,
  base_head_sha: baseHead,
  result_head_sha: baseHead,
  status: "no_head_movement",
  changed_files: ["platform/packages/manifestation-engine/src/branch-embodiment-result-receipt.ts"],
  behavior_exports: ["acceptBranchEmbodimentResultReceipt"],
  external_result_artifacts: [`branch ${branch}`],
});
assert.equal(unmoved.ok, false);
assert.equal(unmoved.action, "block_unmoved_head");

const proofOnly = acceptBranchEmbodimentResultReceipt({
  write_id: writeId,
  admitted_write_ids: [writeId],
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  branch,
  pr_state: "closed",
  merged: true,
  base_head_sha: baseHead,
  result_head_sha: resultHead,
  status: "branch_write_executed",
  changed_files: ["platform/packages/manifestation-engine/src/branch-embodiment-result-receipt-proof.ts"],
  behavior_exports: ["acceptBranchEmbodimentResultReceipt"],
  external_result_artifacts: [`head ${resultHead}`],
});
assert.equal(proofOnly.ok, false);
assert.equal(proofOnly.action, "block_missing_behavior_file");

const synthetic = acceptBranchEmbodimentResultReceipt({
  write_id: writeId,
  admitted_write_ids: [writeId],
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  branch,
  pr_state: "closed",
  merged: true,
  base_head_sha: baseHead,
  result_head_sha: resultHead,
  status: "synthetic_success",
  changed_files: ["platform/packages/manifestation-engine/src/branch-embodiment-result-receipt.ts"],
  behavior_exports: ["acceptBranchEmbodimentResultReceipt"],
  external_result_artifacts: ["local note only"],
});
assert.equal(synthetic.ok, false);
assert.equal(synthetic.action, "block_synthetic_success");

const openPrSurface = acceptBranchEmbodimentResultReceipt({
  write_id: writeId,
  admitted_write_ids: [writeId],
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  branch,
  pr_state: "open",
  merged: false,
  base_head_sha: baseHead,
  result_head_sha: resultHead,
  status: "branch_write_executed",
  changed_files: ["platform/packages/manifestation-engine/src/branch-embodiment-result-receipt.ts"],
  behavior_exports: ["acceptBranchEmbodimentResultReceipt"],
  external_result_artifacts: [`head ${resultHead}`],
});
assert.equal(openPrSurface.ok, false);
assert.equal(openPrSurface.action, "block_wrong_surface");

const blocked = acceptBranchEmbodimentResultReceipt({
  write_id: writeId,
  admitted_write_ids: [writeId],
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  branch,
  pr_state: "closed",
  merged: true,
  base_head_sha: baseHead,
  result_head_sha: baseHead,
  status: "blocked",
  changed_files: [],
  behavior_exports: [],
  external_result_artifacts: ["GitHub contents API"],
  blocker: "GitHub contents API rejected the branch embodiment write",
});
assert.equal(blocked.ok, true);
assert.equal(blocked.action, "accept_branch_embodiment_blocker");
assert.deepEqual(blocked.blockers, ["GitHub contents API rejected the branch embodiment write"]);

console.log("branch embodiment result receipt proof passed");
