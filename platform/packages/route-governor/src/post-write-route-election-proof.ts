import assert from "node:assert/strict";

import {
  electPostWriteRoute,
  type PostWriteRouteElectionInput,
} from "./post-write-route-election.js";
import type { PostWriteStatusEscrowVerdict } from "./post-write-status-escrow.js";

const branch = "monday-platform-genesis-01";
const baseHead = "6ff4c35d45128e09b73168c29f133aa9e00bfb72";
const movedHead = "post-write-route-election-head";

function escrow(overrides: Partial<PostWriteStatusEscrowVerdict> = {}): PostWriteStatusEscrowVerdict {
  return {
    ok: true,
    action: "open_post_write_status_escrow",
    branch,
    base_head_sha: baseHead,
    required_status_head_sha: movedHead,
    escrow_id: "post-write-status-escrow-live-head-001",
    decisive_evidence: ["write receipt", "required moved-head status"],
    blockers: [],
    next_route: "read fresh status for the moved post-write head",
    ...overrides,
  };
}

function input(overrides: Partial<PostWriteRouteElectionInput> = {}): PostWriteRouteElectionInput {
  return {
    active_branch: branch,
    live_head_sha: movedHead,
    election_id: "post-write-route-election-live-head-001",
    spent_election_ids: [],
    escrow: escrow(),
    requested_route: "fresh_status_readback",
    ...overrides,
  };
}

const statusReadback = electPostWriteRoute(input());
assert.equal(statusReadback.ok, true);
assert.equal(statusReadback.action, "route_to_fresh_status_readback");

const prematureMerge = electPostWriteRoute(input({ requested_route: "merge_command" }));
assert.equal(prematureMerge.ok, false);
assert.equal(prematureMerge.action, "block_premature_route");
assert.deepEqual(prematureMerge.blockers, ["merge_command cannot run before moved-head status readback"]);

const releasedStatus = escrow({
  action: "release_head_bound_status",
  decisive_evidence: ["moved-head checks succeeded"],
});

const reviewRequest = electPostWriteRoute(input({ escrow: releasedStatus, requested_route: "review_request" }));
assert.equal(reviewRequest.ok, true);
assert.equal(reviewRequest.action, "route_to_review_request");

const nextEmbodiment = electPostWriteRoute(
  input({ escrow: releasedStatus, requested_route: "external_platform_embodiment" }),
);
assert.equal(nextEmbodiment.ok, true);
assert.equal(nextEmbodiment.action, "route_to_next_embodiment");

const staleHead = electPostWriteRoute(
  input({
    escrow: escrow({ required_status_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
  }),
);
assert.equal(staleHead.ok, false);
assert.equal(staleHead.action, "block_head_mismatch");

const failedStatus = electPostWriteRoute(
  input({
    escrow: escrow({
      ok: false,
      action: "block_failing_status_authority",
      blockers: ["Route Governor Proof failed on moved head"],
    }),
    requested_route: "review_request",
  }),
);
assert.equal(failedStatus.ok, false);
assert.equal(failedStatus.action, "block_unresolved_write_status");

const nonProgress = electPostWriteRoute(input({ requested_route: "metadata_reread" }));
assert.equal(nonProgress.ok, false);
assert.equal(nonProgress.action, "block_non_progress_route");

const exactBlocker = electPostWriteRoute(
  input({
    requested_route: "exact_external_blocker",
    exact_blocker: "GitHub did not expose moved-head status for the post-write commit",
  }),
);
assert.equal(exactBlocker.ok, true);
assert.equal(exactBlocker.action, "emit_exact_external_blocker");
