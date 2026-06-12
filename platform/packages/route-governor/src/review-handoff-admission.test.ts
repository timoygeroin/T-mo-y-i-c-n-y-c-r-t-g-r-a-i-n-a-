import assert from "node:assert/strict";

import { routeReviewHandoff, type ReviewHandoffInput } from "./review-handoff-admission.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const branch = "monday-platform-genesis-01";
const head = "98cf226989537ba7f02dba15483921e6ba06e026";

function input(overrides: Partial<ReviewHandoffInput> = {}): ReviewHandoffInput {
  return {
    repository_full_name: repository,
    pr_number: 2,
    active_branch: branch,
    live_head_sha: head,
    target_branch: branch,
    target_head_sha: head,
    pr_state: "open",
    draft: false,
    mergeable: true,
    status_verdict: "passing_with_warnings",
    blocking_failures: [],
    pending_surfaces: [],
    non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
    requested_action: "request_review",
    requested_reviewers: ["timoygeroin"],
    merge_authority_confirmed: false,
    spent_actions: [],
    ...overrides,
  };
}

const review = routeReviewHandoff(input());
assert.equal(review.ok, true);
assert.equal(review.action, "admit_review_request");
assert.match(review.decisive_evidence.join("\n"), /reviewer timoygeroin/);
assert.deepEqual(review.blockers, []);

const staleHead = routeReviewHandoff(input({ target_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }));
assert.equal(staleHead.ok, false);
assert.equal(staleHead.action, "block_branch_or_head_mismatch");

const duplicateStatus = routeReviewHandoff(input({ requested_action: "read_status" }));
assert.equal(duplicateStatus.ok, false);
assert.equal(duplicateStatus.action, "block_non_progress_action");

const failing = routeReviewHandoff(
  input({
    status_verdict: "failing",
    blocking_failures: ["Route Governor Proof / proof examples failed"],
  }),
);
assert.equal(failing.ok, false);
assert.equal(failing.action, "block_unstable_status");

const missingReviewer = routeReviewHandoff(input({ requested_reviewers: [] }));
assert.equal(missingReviewer.ok, false);
assert.equal(missingReviewer.action, "block_missing_review_target");

const mergeWithoutAuthority = routeReviewHandoff(input({ requested_action: "merge" }));
assert.equal(mergeWithoutAuthority.ok, false);
assert.equal(mergeWithoutAuthority.action, "block_missing_merge_authority");

const merge = routeReviewHandoff(
  input({
    requested_action: "merge",
    merge_authority_confirmed: true,
  }),
);
assert.equal(merge.ok, true);
assert.equal(merge.action, "admit_merge_handoff");
assert.match(merge.next_route, /expected-head/);

console.log("review handoff admission tests passed");
