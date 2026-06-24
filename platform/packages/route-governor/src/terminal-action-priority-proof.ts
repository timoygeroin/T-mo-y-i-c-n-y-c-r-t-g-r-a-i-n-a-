import assert from "node:assert/strict";

import {
  prioritizeTerminalAction,
  type TerminalActionPriorityInput,
  type TerminalAuthorityLease,
} from "./terminal-action-priority.js";

const BRANCH = "monday-platform-genesis-01";
const LIVE_HEAD = "2c7bd2c69d21ca61c91d01579e20c4765f88f02d";
const OLD_REPAIRED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function lease(kind: TerminalAuthorityLease["kind"], overrides: Partial<TerminalAuthorityLease> = {}): TerminalAuthorityLease {
  return {
    lease_id: `${kind}-lease`,
    kind,
    branch: BRANCH,
    head_sha: LIVE_HEAD,
    ok: true,
    evidence: [`${kind} bound to ${LIVE_HEAD}`],
    blockers: [],
    warnings: kind === "status_lease" ? ["Node.js 20 Actions deprecation notice is warning-only"] : [],
    ...overrides,
  };
}

function input(overrides: Partial<TerminalActionPriorityInput> = {}): TerminalActionPriorityInput {
  return {
    active_branch: BRANCH,
    live_head_sha: LIVE_HEAD,
    action_id: "terminal-action-priority-proof",
    spent_action_ids: [],
    requested_action: "external_platform_embodiment",
    status_verdict: "passing_with_warnings",
    leases: [lease("status_lease")],
    embodiment_candidate: {
      candidate_id: "terminal-action-priority",
      branch: BRANCH,
      base_head_sha: LIVE_HEAD,
      artifact_class: "terminal_action_priority_router",
      changed_files: ["platform/packages/route-governor/src/terminal-action-priority.ts"],
      behavior_artifacts: ["prioritizeTerminalAction"],
      routing_artifacts: ["terminal actions must consume live-head authority leases, not summaries"],
      proof_artifacts: ["dist/terminal-action-priority-proof.js"],
    },
    ...overrides,
  };
}

const embodiment = prioritizeTerminalAction(input());
assert.equal(embodiment.ok, true);
assert.equal(embodiment.action, "select_external_embodiment");
assert.deepEqual(embodiment.admitted_lease_ids, ["status_lease-lease"]);
assert.ok(embodiment.decisive_evidence.includes("prioritizeTerminalAction"));
assert.ok(embodiment.next_route.includes("resulting new head"));

const duplicate = prioritizeTerminalAction(input({ requested_action: "duplicate_status_summary" }));
assert.equal(duplicate.ok, false);
assert.equal(duplicate.action, "block_non_progress_action");
assert.ok(duplicate.blockers.includes("duplicate_status_summary cannot be selected as terminal progress"));

const staleLease = prioritizeTerminalAction(
  input({ leases: [lease("status_lease", { head_sha: OLD_REPAIRED_HEAD })] }),
);
assert.equal(staleLease.ok, false);
assert.equal(staleLease.action, "block_head_mismatch");
assert.ok(staleLease.blockers[0].includes(OLD_REPAIRED_HEAD));

const failingStatus = prioritizeTerminalAction(input({ status_verdict: "failing" }));
assert.equal(failingStatus.ok, false);
assert.equal(failingStatus.action, "block_status_not_passing");
assert.ok(failingStatus.next_route.includes("current-head failing status"));

const review = prioritizeTerminalAction(
  input({
    requested_action: "request_final_review",
    leases: [lease("status_lease"), lease("mergeability_lease"), lease("blocker_retirement")],
    embodiment_candidate: undefined,
  }),
);
assert.equal(review.ok, true);
assert.equal(review.action, "select_review_request");
assert.deepEqual(review.admitted_lease_ids, ["status_lease-lease", "mergeability_lease-lease", "blocker_retirement-lease"]);

const prematureMerge = prioritizeTerminalAction(
  input({
    requested_action: "merge_finalization",
    leases: [lease("status_lease"), lease("mergeability_lease"), lease("blocker_retirement")],
    embodiment_candidate: undefined,
  }),
);
assert.equal(prematureMerge.ok, false);
assert.equal(prematureMerge.action, "block_missing_required_authority");
assert.ok(prematureMerge.blockers.includes("missing terminal authority lease: review_lease"));

const merge = prioritizeTerminalAction(
  input({
    requested_action: "merge_finalization",
    leases: [lease("status_lease"), lease("mergeability_lease"), lease("review_lease"), lease("blocker_retirement")],
    embodiment_candidate: undefined,
  }),
);
assert.equal(merge.ok, true);
assert.equal(merge.action, "select_merge_finalization");
assert.ok(merge.next_route.includes("status, mergeability, review, and blocker-retirement leases"));

const blocker = prioritizeTerminalAction(
  input({
    requested_action: "exact_external_blocker",
    exact_blocker: "No real GitHub reviewer target is available for request_final_review",
    leases: [],
    embodiment_candidate: undefined,
  }),
);
assert.equal(blocker.ok, true);
assert.equal(blocker.action, "emit_exact_external_blocker");
assert.deepEqual(blocker.blockers, ["No real GitHub reviewer target is available for request_final_review"]);

console.log("terminal action priority proof passed");
