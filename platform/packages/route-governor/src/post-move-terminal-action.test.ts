import test from "node:test";
import assert from "node:assert/strict";

import { compilePostMoveTerminalAction, type PostMoveTerminalActionInput } from "./post-move-terminal-action.js";

const liveHead = "61a024200b09f7597a3a2713a5f96ac0c180b599";
const previousHead = "3bf8e07dce32e59accf776357fb22278f57ba3f5";

function baseInput(overrides: Partial<PostMoveTerminalActionInput> = {}): PostMoveTerminalActionInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    last_status_readback_head_sha: previousHead,
    prompt_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    resolved_historical_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841", previousHead],
    draft: false,
    mergeable: true,
    required_approval_count: 1,
    promoted_surface_ids: ["merge-finalization-command-public-surface", "merge-result-receipt-public-surface"],
    spent_action_ids: [],
    action_id: "post-move-terminal-action-public-surface",
    ...overrides,
  };
}

function passingStatus() {
  return {
    surface_id: "checks/live-head",
    head_sha: liveHead,
    verdict: "passing_with_warnings" as const,
    decisive_successes: ["Route governor proof examples succeeded"],
    blocking_failures: [],
    pending_surfaces: [],
    non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
  };
}

test("routes moved heads to fresh status readback before downstream action", () => {
  const verdict = compilePostMoveTerminalAction(baseInput());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "read_fresh_status");
  assert.match(verdict.decisive_evidence.join("\n"), new RegExp(previousHead));
  assert.match(verdict.decisive_evidence.join("\n"), /prompt head b38ea247602ae8ebba80c4120ad03b41b26bd841/);
});

test("requires a concrete failure signature before repairing a failing live head", () => {
  const verdict = compilePostMoveTerminalAction(
    baseInput({
      last_status_readback_head_sha: liveHead,
      status_surface: {
        surface_id: "checks/live-head",
        head_sha: liveHead,
        verdict: "failing",
        decisive_successes: [],
        blocking_failures: ["Typecheck route governor failed"],
        pending_surfaces: [],
        non_blocking_warnings: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.match(verdict.blockers.join("\n"), /failure signature/);
});

test("routes signed current-head failures to repair", () => {
  const verdict = compilePostMoveTerminalAction(
    baseInput({
      last_status_readback_head_sha: liveHead,
      status_surface: {
        surface_id: "checks/live-head",
        head_sha: liveHead,
        verdict: "failing",
        decisive_successes: [],
        blocking_failures: ["Typecheck route governor failed"],
        pending_surfaces: [],
        non_blocking_warnings: [],
        failure_signature: "TS2339 Property minLength does not exist on type JsonSchema",
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "repair_current_head_failure");
  assert.match(verdict.decisive_evidence.join("\n"), /TS2339/);
});

test("routes passing status without approval to review wait", () => {
  const verdict = compilePostMoveTerminalAction(
    baseInput({
      last_status_readback_head_sha: liveHead,
      status_surface: passingStatus(),
      review_surface: {
        surface_id: "review/live-head",
        head_sha: liveHead,
        verdict: "pending",
        approvals: [],
        change_requests: [],
        pending_reviewers: ["reviewer-a"],
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "request_or_wait_for_review");
  assert.match(verdict.next_route, /review approval/);
});

test("routes passing status and approval to merge execution", () => {
  const verdict = compilePostMoveTerminalAction(
    baseInput({
      last_status_readback_head_sha: liveHead,
      status_surface: passingStatus(),
      review_surface: {
        surface_id: "review/live-head",
        head_sha: liveHead,
        verdict: "approved",
        approvals: ["reviewer-a"],
        change_requests: [],
        pending_reviewers: [],
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "compile_merge_execution");
});

test("blocks spent action ids as non-progress", () => {
  const verdict = compilePostMoveTerminalAction(
    baseInput({ spent_action_ids: ["post-move-terminal-action-public-surface"] }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_surface");
  assert.match(verdict.blockers.join("\n"), /already spent/);
});
