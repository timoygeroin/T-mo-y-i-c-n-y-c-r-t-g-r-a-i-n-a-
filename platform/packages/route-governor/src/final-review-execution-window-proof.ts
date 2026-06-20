import assert from "node:assert/strict";

import {
  routeFinalReviewExecutionWindow,
  type FinalReviewExecutionWindowInput,
  type FinalReviewLease,
} from "./final-review-execution-window.js";

const head = "f0951fc3b36af6445d98586558999f3373f1aca7";
const branch = "monday-platform-genesis-01";

function lease(lease_id: string, overrides: Partial<FinalReviewLease> = {}): FinalReviewLease {
  return {
    lease_id,
    branch,
    head_sha: head,
    evidence: [`${lease_id} evidence`],
    ...overrides,
  };
}

function baseInput(overrides: Partial<FinalReviewExecutionWindowInput> = {}): FinalReviewExecutionWindowInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    window_id: "final-review-window-live-head-001",
    spent_window_ids: [],
    command: "request_final_review",
    status_lease: lease("status-lease-live-head"),
    mergeability_lease: lease("mergeability-lease-live-head"),
    review_lease: lease("review-lease-live-head"),
    active_blockers: [],
    ...overrides,
  };
}

const command = routeFinalReviewExecutionWindow(baseInput());
assert.equal(command.ok, true);
assert.equal(command.action, "execute_final_review_command");
assert.match(command.next_route, /new execution window/);

const openWindow = routeFinalReviewExecutionWindow(baseInput({ command: "fresh_status_readback" }));
assert.equal(openWindow.ok, true);
assert.equal(openWindow.action, "open_final_review_execution_window");

const staleLease = routeFinalReviewExecutionWindow(
  baseInput({
    status_lease: lease("status-lease-old-head", { head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
  }),
);
assert.equal(staleLease.ok, false);
assert.equal(staleLease.action, "block_head_mismatch");
assert.match(staleLease.blockers.join("\n"), /not live head/);

const duplicate = routeFinalReviewExecutionWindow(
  baseInput({
    spent_window_ids: ["final-review-window-live-head-001"],
  }),
);
assert.equal(duplicate.ok, false);
assert.equal(duplicate.action, "block_reused_window");

const nonProgress = routeFinalReviewExecutionWindow(baseInput({ command: "metadata_reread" }));
assert.equal(nonProgress.ok, false);
assert.equal(nonProgress.action, "block_non_progress_command");

const blocker = routeFinalReviewExecutionWindow(
  baseInput({
    command: "exact_external_blocker",
    exact_blocker: "review lease unavailable for the live PR head",
    status_lease: undefined,
    mergeability_lease: undefined,
    review_lease: undefined,
  }),
);
assert.equal(blocker.ok, true);
assert.equal(blocker.action, "emit_exact_external_blocker");
