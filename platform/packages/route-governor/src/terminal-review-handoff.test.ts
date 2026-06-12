import assert from "node:assert/strict";

import {
  compileTerminalReviewHandoff,
  type TerminalReviewHandoffInput,
} from "./terminal-review-handoff.js";

const branch = "monday-platform-genesis-01";
const liveHead = "ab3019c4b12889c526c6eddbdd00716b6335b95a";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<TerminalReviewHandoffInput> = {}): TerminalReviewHandoffInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    active_branch: branch,
    candidate_branch: branch,
    live_head_sha: liveHead,
    last_embodiment_head_sha: liveHead,
    historical_repaired_heads: [repairedHead],
    merge_ready: true,
    mergeable: true,
    draft: false,
    requested_action: "request_review",
    status_surface: {
      surface_id: "current-head-status",
      head_sha: liveHead,
      verdict: "passing_with_warnings",
      decisive_successes: ["Route Governor Proof pull_request succeeded"],
      blockers: [],
      warnings: ["Node.js 20 Actions deprecation notice"],
    },
    ...overrides,
  };
}

const review = compileTerminalReviewHandoff(input());
assert.equal(review.ok, true);
assert.equal(review.action, "admit_review_request");
assert.equal(review.quarantined_heads.includes(repairedHead), true);
assert.match(review.next_route, /request final review/);
assert.deepEqual(review.warnings, ["Node.js 20 Actions deprecation notice"]);

const merge = compileTerminalReviewHandoff(input({ requested_action: "merge" }));
assert.equal(merge.ok, true);
assert.equal(merge.action, "admit_merge");

const staleStatus = compileTerminalReviewHandoff(
  input({
    status_surface: {
      surface_id: "old-repaired-head-status",
      head_sha: repairedHead,
      verdict: "passing",
      decisive_successes: ["old repaired-head checks passed"],
      blockers: [],
      warnings: [],
    },
  }),
);
assert.equal(staleStatus.ok, false);
assert.equal(staleStatus.action, "block_stale_status");

const historicalAsLive = compileTerminalReviewHandoff(
  input({
    live_head_sha: repairedHead,
    last_embodiment_head_sha: repairedHead,
    status_surface: {
      surface_id: "resolved-boundary-status",
      head_sha: repairedHead,
      verdict: "passing",
      decisive_successes: ["resolved repaired-head checks passed"],
      blockers: [],
      warnings: [],
    },
  }),
);
assert.equal(historicalAsLive.ok, false);
assert.equal(historicalAsLive.action, "block_historical_head");

const pending = compileTerminalReviewHandoff(
  input({
    status_surface: {
      surface_id: "pending-live-status",
      head_sha: liveHead,
      verdict: "pending",
      decisive_successes: [],
      blockers: [],
      warnings: [],
    },
  }),
);
assert.equal(pending.ok, false);
assert.equal(pending.action, "block_incomplete_readiness");
assert.match(pending.blockers.join("\n"), /pending/);

const notMergeReady = compileTerminalReviewHandoff(input({ merge_ready: false }));
assert.equal(notMergeReady.ok, false);
assert.equal(notMergeReady.action, "block_incomplete_readiness");
assert.match(notMergeReady.blockers.join("\n"), /merge readiness/);

const embodimentDrift = compileTerminalReviewHandoff(input({ requested_action: "continue_embodiment" }));
assert.equal(embodimentDrift.ok, false);
assert.equal(embodimentDrift.action, "route_to_external_embodiment");
assert.match(embodimentDrift.next_route, /request review or merge/);

const exactBlocker = compileTerminalReviewHandoff(
  input({
    requested_action: "emit_blocker",
    exact_blocker: "GitHub review request API is unavailable in the current connector surface",
  }),
);
assert.equal(exactBlocker.ok, true);
assert.equal(exactBlocker.action, "admit_exact_blocker");

const unboundBranch = compileTerminalReviewHandoff(input({ candidate_branch: "main" }));
assert.equal(unboundBranch.ok, false);
assert.equal(unboundBranch.action, "block_unbound_request");
