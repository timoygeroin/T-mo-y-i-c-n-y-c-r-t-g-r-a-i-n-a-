import assert from "node:assert/strict";

import { consumeDownstreamAuthority } from "./downstream-authority-consumption-lease.js";

const branch = "monday-platform-genesis-01";
const previousStatusHead = "3bf8e07dce32e59accf776357fb22278f57ba3f5";
const liveHead = "89b66a51cce1730e844806f8d56ddb879fc80833";

const missingLiveStatus = consumeDownstreamAuthority({
  active_branch: branch,
  live_head_sha: liveHead,
  previous_status_head_sha: previousStatusHead,
  authority_id: "downstream-authority-proof-001",
  spent_authority_ids: [],
  authority_kind: "merge_finalization",
});

assert.equal(missingLiveStatus.ok, false);
assert.equal(missingLiveStatus.action, "require_moved_head_status");
assert.deepEqual(missingLiveStatus.blockers, [
  `live head ${liveHead} has no status lease after previous status head ${previousStatusHead}`,
]);

const admittedReviewAuthority = consumeDownstreamAuthority({
  active_branch: branch,
  live_head_sha: liveHead,
  previous_status_head_sha: previousStatusHead,
  authority_id: "downstream-authority-proof-002",
  spent_authority_ids: [],
  authority_kind: "review_request",
  status_lease: {
    lease_id: "status-lease-proof-live-head",
    branch,
    head_sha: liveHead,
    ok: true,
    verdict: "passing_with_warnings",
    evidence: ["live-head route governor proof examples succeeded"],
    blockers: [],
    warnings: ["Node.js 20 Actions deprecation notice"],
  },
});

assert.equal(admittedReviewAuthority.ok, true);
assert.equal(admittedReviewAuthority.action, "admit_downstream_authority");
assert.equal(admittedReviewAuthority.consumed_status_lease_id, "status-lease-proof-live-head");
assert.deepEqual(admittedReviewAuthority.blockers, []);
