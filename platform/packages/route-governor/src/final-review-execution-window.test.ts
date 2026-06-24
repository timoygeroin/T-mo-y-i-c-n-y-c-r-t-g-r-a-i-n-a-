import assert from "node:assert/strict";
import test from "node:test";

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
    command: "merge_finalization",
    status_lease: lease("status-lease-live-head"),
    mergeability_lease: lease("mergeability-lease-live-head"),
    review_lease: lease("review-lease-live-head"),
    active_blockers: [],
    ...overrides,
  };
}

test("executes final review command with three live-head leases", () => {
  const verdict = routeFinalReviewExecutionWindow(baseInput());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "execute_final_review_command");
  assert.match(verdict.decisive_evidence.join("\n"), /status-lease-live-head/);
  assert.equal(verdict.blockers.length, 0);
});

test("opens a single-use window for fresh status routing without executing review command", () => {
  const verdict = routeFinalReviewExecutionWindow(baseInput({ command: "fresh_status_readback" }));

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "open_final_review_execution_window");
});

test("blocks stale lease heads", () => {
  const verdict = routeFinalReviewExecutionWindow(
    baseInput({
      review_lease: lease("review-lease-repaired-head", { head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_head_mismatch");
  assert.match(verdict.blockers.join("\n"), /not live head/);
});

test("blocks missing leases before final review execution", () => {
  const verdict = routeFinalReviewExecutionWindow(
    baseInput({
      mergeability_lease: undefined,
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_lease");
});

test("blocks non-progress commands", () => {
  const verdict = routeFinalReviewExecutionWindow(baseInput({ command: "duplicate_comment" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_command");
});

test("admits exact external blocker without pretending execution authority exists", () => {
  const verdict = routeFinalReviewExecutionWindow(
    baseInput({
      command: "exact_external_blocker",
      exact_blocker: "mergeability lease unavailable for the live PR head",
      status_lease: undefined,
      mergeability_lease: undefined,
      review_lease: undefined,
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["mergeability lease unavailable for the live PR head"]);
});
