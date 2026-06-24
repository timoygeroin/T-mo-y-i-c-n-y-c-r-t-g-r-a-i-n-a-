import { compilePostMoveTerminalAction, type PostMoveTerminalActionInput } from "./post-move-terminal-action.js";

const liveHead = "61a024200b09f7597a3a2713a5f96ac0c180b599";
const previousHead = "3bf8e07dce32e59accf776357fb22278f57ba3f5";

function passingStatus() {
  return {
    surface_id: "checks/live-head",
    head_sha: liveHead,
    verdict: "passing_with_warnings" as const,
    decisive_successes: ["Route governor proof examples succeeded", "Monday Platform CI succeeded"],
    blocking_failures: [],
    pending_surfaces: [],
    non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
  };
}

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

function expectAction(name: string, actual: string, expected: string): void {
  if (actual !== expected) throw new Error(`${name} expected ${expected}, got ${actual}`);
}

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
}

function expectBlock(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) throw new Error(`${name} should block, but passed`);
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not block for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

export function runPostMoveTerminalActionProof(): void {
  const movedHeadNeedsStatus = compilePostMoveTerminalAction(baseInput());
  expectOk("moved head status route", movedHeadNeedsStatus.ok, movedHeadNeedsStatus.blockers);
  expectAction("moved head status route", movedHeadNeedsStatus.action, "read_fresh_status");
  if (!movedHeadNeedsStatus.decisive_evidence.some((item) => item.includes(previousHead))) {
    throw new Error("moved-head route did not preserve previous status head evidence");
  }

  const failingWithoutSignature = compilePostMoveTerminalAction(
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
  expectBlock("failing status without signature", failingWithoutSignature.ok, failingWithoutSignature.blockers, "signature");

  const failingWithSignature = compilePostMoveTerminalAction(
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
  expectOk("failing status repair route", failingWithSignature.ok, failingWithSignature.blockers);
  expectAction("failing status repair route", failingWithSignature.action, "repair_current_head_failure");

  const reviewWait = compilePostMoveTerminalAction(
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
  expectOk("review wait route", reviewWait.ok, reviewWait.blockers);
  expectAction("review wait route", reviewWait.action, "request_or_wait_for_review");

  const mergeReady = compilePostMoveTerminalAction(
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
  expectOk("merge ready route", mergeReady.ok, mergeReady.blockers);
  expectAction("merge ready route", mergeReady.action, "compile_merge_execution");

  const spentAction = compilePostMoveTerminalAction(
    baseInput({ spent_action_ids: ["post-move-terminal-action-public-surface"] }),
  );
  expectBlock("spent action id", spentAction.ok, spentAction.blockers, "already spent");
}

runPostMoveTerminalActionProof();
