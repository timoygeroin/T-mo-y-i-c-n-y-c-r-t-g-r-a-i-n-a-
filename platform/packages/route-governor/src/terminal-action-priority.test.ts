import assert from "node:assert/strict";
import { test } from "node:test";

import {
  prioritizeTerminalAction,
  type TerminalActionPriorityInput,
  type TerminalAuthorityLease,
} from "./terminal-action-priority.js";

const BRANCH = "monday-platform-genesis-01";
const LIVE_HEAD = "695ad2e6277daaf4073e00f29e2be34897d32772";
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
    action_id: "terminal-action-priority-test",
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
      proof_artifacts: ["dist/terminal-action-priority.test.js"],
    },
    ...overrides,
  };
}

test("selects behavior-bearing embodiment after live-head status authority", () => {
  const verdict = prioritizeTerminalAction(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_external_embodiment");
  assert.deepEqual(verdict.admitted_lease_ids, ["status_lease-lease"]);
  assert.ok(verdict.decisive_evidence.includes("prioritizeTerminalAction"));
  assert.ok(verdict.next_route.includes("resulting new head"));
});

test("blocks duplicate summary and metadata classes as terminal progress", () => {
  const verdict = prioritizeTerminalAction(input({ requested_action: "duplicate_status_summary" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_action");
  assert.ok(verdict.blockers.includes("duplicate_status_summary cannot be selected as terminal progress"));
});

test("rejects status authority from the old repaired head", () => {
  const verdict = prioritizeTerminalAction(
    input({ leases: [lease("status_lease", { head_sha: OLD_REPAIRED_HEAD })] }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_head_mismatch");
  assert.ok(verdict.blockers[0].includes(OLD_REPAIRED_HEAD));
});

test("routes failing current-head status to repair before terminal action", () => {
  const verdict = prioritizeTerminalAction(input({ status_verdict: "failing" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_status_not_passing");
  assert.ok(verdict.next_route.includes("current-head failing status"));
});

test("admits review request with status, mergeability, and blocker-retirement authority", () => {
  const verdict = prioritizeTerminalAction(
    input({
      requested_action: "request_final_review",
      leases: [lease("status_lease"), lease("mergeability_lease"), lease("blocker_retirement")],
      embodiment_candidate: undefined,
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_review_request");
  assert.deepEqual(verdict.admitted_lease_ids, ["status_lease-lease", "mergeability_lease-lease", "blocker_retirement-lease"]);
});

test("blocks merge finalization until review authority exists", () => {
  const verdict = prioritizeTerminalAction(
    input({
      requested_action: "merge_finalization",
      leases: [lease("status_lease"), lease("mergeability_lease"), lease("blocker_retirement")],
      embodiment_candidate: undefined,
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_required_authority");
  assert.ok(verdict.blockers.includes("missing terminal authority lease: review_lease"));
});

test("admits merge finalization only when all terminal authority is live-head bound", () => {
  const verdict = prioritizeTerminalAction(
    input({
      requested_action: "merge_finalization",
      leases: [lease("status_lease"), lease("mergeability_lease"), lease("review_lease"), lease("blocker_retirement")],
      embodiment_candidate: undefined,
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "select_merge_finalization");
  assert.ok(verdict.next_route.includes("status, mergeability, review, and blocker-retirement leases"));
});

test("emits a named exact external blocker without consuming leases", () => {
  const verdict = prioritizeTerminalAction(
    input({
      requested_action: "exact_external_blocker",
      exact_blocker: "No real GitHub reviewer target is available for request_final_review",
      leases: [],
      embodiment_candidate: undefined,
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["No real GitHub reviewer target is available for request_final_review"]);
});
