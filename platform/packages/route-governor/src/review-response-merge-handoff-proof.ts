import assert from "node:assert/strict";

import { compileReviewResponseMergeHandoff } from "./review-response-merge-handoff.js";

const head = "a214343108e577a7ad8e5e9063b689a1e7f5a63a";
const response = {
  ok: true,
  action: "route_to_merge_gate" as const,
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  branch: "monday-platform-genesis-01",
  head_sha: head,
  approvals: ["external-reviewer"],
  change_requests: [],
  pending_reviewers: [],
  decisive_evidence: [`receipt head ${head}`, "approved by external-reviewer"],
  blockers: [],
  next_route: "enter merge gate only after live-head status and mergeability are still current",
};

const verdict = compileReviewResponseMergeHandoff({
  response,
  repaired_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
  last_status_readback_head_sha: head,
  resolved_blocker_ids: ["blocked:ci-status-readback"],
  draft: false,
  mergeable: true,
  required_approval_count: 1,
  status_surface: {
    surface_id: "status-readback-live-head-a2143431",
    head_sha: head,
    verdict: "passing_with_warnings",
    decisive_successes: ["Route Governor Proof succeeded", "Monday Platform CI succeeded"],
    blockers: [],
    warnings: ["Node.js 20 Actions deprecation notice"],
  },
});

assert.equal(verdict.ok, true);
assert.equal(verdict.action, "compile_merge_handoff");
assert.equal(verdict.merge_handoff?.action, "admit_merge_handoff");
assert.match(verdict.next_route, /guarded GitHub merge command/);

const repair = compileReviewResponseMergeHandoff({
  ...verdict,
  response: {
    ...response,
    ok: false,
    action: "route_to_review_repair",
    approvals: [],
    change_requests: ["external-reviewer"],
    blockers: ["review changes requested by external-reviewer"],
  },
  repaired_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
  last_status_readback_head_sha: head,
  resolved_blocker_ids: ["blocked:ci-status-readback"],
  draft: false,
  mergeable: true,
  required_approval_count: 1,
  status_surface: {
    surface_id: "status-readback-live-head-a2143431",
    head_sha: head,
    verdict: "passing_with_warnings",
    decisive_successes: ["Route Governor Proof succeeded"],
    blockers: [],
    warnings: [],
  },
});

assert.equal(repair.ok, false);
assert.equal(repair.action, "route_to_review_repair");

console.log("review response merge handoff proof passed");
