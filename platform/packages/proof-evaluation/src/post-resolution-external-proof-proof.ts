import assert from "node:assert/strict";

import { evaluatePostResolutionExternalProof } from "./post-resolution-external-proof.js";

const branch = "monday-platform-genesis-01";
const liveHead = "5f735829c3ddeb1a23ebfb0ca0e81baeb53c2057";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

const admitted = evaluatePostResolutionExternalProof({
  proof_id: "post-resolution-proof-evaluation-gate",
  branch,
  live_head_sha: liveHead,
  repaired_head_sha: repairedHead,
  proof_head_sha: liveHead,
  resolved_boundary_ids: ["issue-1-ci-status-readback", "repaired-head-checks-green"],
  proof_class: "external_platform_embodiment",
  exhausted_proof_classes: ["metadata_reread", "duplicate_ci_summary", "local_memory_guard"],
  source_authority: [
    "direct_current_instruction",
    "live_pr_head",
    "source_ranked_route",
    "proof_evaluation_record",
  ],
  external_artifacts: [
    "platform/packages/proof-evaluation/src/post-resolution-external-proof.ts",
    "platform/packages/proof-evaluation/src/post-resolution-external-proof-proof.ts",
  ],
  future_routing_delta: ["post-resolution proof can no longer reuse repaired-head status as progress"],
});

assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_post_resolution_external_proof");
assert.deepEqual(admitted.blockers, []);
assert.ok(admitted.quarantined_head_shas.includes(repairedHead));
assert.match(admitted.next_route, /not as a repaired-head status claim/);

const repairedHeadReuse = evaluatePostResolutionExternalProof({
  ...admitted,
  proof_id: "repaired-head-reuse",
  live_head_sha: repairedHead,
  proof_head_sha: repairedHead,
  repaired_head_sha: repairedHead,
  proof_class: "external_platform_embodiment",
  resolved_boundary_ids: ["issue-1-ci-status-readback"],
  exhausted_proof_classes: [],
  source_authority: [
    "direct_current_instruction",
    "live_pr_head",
    "source_ranked_route",
    "proof_evaluation_record",
  ],
  external_artifacts: ["platform/packages/proof-evaluation/src/post-resolution-external-proof.ts"],
  future_routing_delta: ["should be blocked"],
});
assert.equal(repairedHeadReuse.ok, false);
assert.equal(repairedHeadReuse.action, "block_repaired_head_reuse");

const duplicateStatus = evaluatePostResolutionExternalProof({
  proof_id: "duplicate-status-summary",
  branch,
  live_head_sha: liveHead,
  repaired_head_sha: repairedHead,
  proof_head_sha: liveHead,
  resolved_boundary_ids: ["issue-1-ci-status-readback"],
  proof_class: "duplicate_ci_summary",
  exhausted_proof_classes: [],
  source_authority: [
    "direct_current_instruction",
    "live_pr_head",
    "source_ranked_route",
    "proof_evaluation_record",
  ],
  external_artifacts: ["PR #2 checks were already repaired on the old head"],
  future_routing_delta: ["none"],
});
assert.equal(duplicateStatus.ok, false);
assert.equal(duplicateStatus.action, "block_recycled_or_non_progress_class");

const weakAuthority = evaluatePostResolutionExternalProof({
  proof_id: "summary-only-proof",
  branch,
  live_head_sha: liveHead,
  repaired_head_sha: repairedHead,
  proof_head_sha: liveHead,
  resolved_boundary_ids: ["issue-1-ci-status-readback"],
  proof_class: "external_platform_embodiment",
  exhausted_proof_classes: [],
  source_authority: ["model_summary"],
  external_artifacts: ["summary says it is done"],
  future_routing_delta: ["none"],
});
assert.equal(weakAuthority.ok, false);
assert.equal(weakAuthority.action, "block_missing_authority");

const blocker = evaluatePostResolutionExternalProof({
  proof_id: "contents-api-blocker",
  branch,
  live_head_sha: liveHead,
  repaired_head_sha: repairedHead,
  proof_head_sha: liveHead,
  resolved_boundary_ids: ["issue-1-ci-status-readback"],
  proof_class: "exact_external_blocker",
  exhausted_proof_classes: [],
  source_authority: ["direct_current_instruction", "live_pr_head"],
  external_artifacts: [],
  future_routing_delta: [],
  exact_blocker: "GitHub contents API rejected proof-evaluation branch writes",
});
assert.equal(blocker.ok, true);
assert.equal(blocker.action, "admit_exact_external_blocker_proof");
assert.deepEqual(blocker.blockers, ["GitHub contents API rejected proof-evaluation branch writes"]);

console.log("post-resolution external proof gate proof passed");
