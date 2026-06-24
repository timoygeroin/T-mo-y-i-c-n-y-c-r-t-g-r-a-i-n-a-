import {
  reconcilePromptHeadWithLiveHead,
  type PromptHeadReconciliationInput,
} from "./prompt-head-reconciliation.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "fd0ddbaf906df4630bac271ddc804e3d1b7658fd";
const prohibitedBlocker = "repaired-head status readback is missing for b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<PromptHeadReconciliationInput> = {}): PromptHeadReconciliationInput {
  return {
    branch,
    active_branch: branch,
    prompt_head_sha: repairedHead,
    live_head_sha: liveHead,
    resolved_repaired_head_sha: repairedHead,
    resolved_repaired_head_status: true,
    prohibited_blockers: [prohibitedBlocker],
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runPromptHeadReconciliationProof(): void {
  const movedHead = reconcilePromptHeadWithLiveHead(input());
  assert(movedHead.ok, "moved live head should produce a valid readback route");
  assert(movedHead.action === "read_live_head_status", `expected live status readback, got ${movedHead.action}`);
  assert(!movedHead.prompt_head_allowed, "stale prompt head must not remain allowed after live head movement");

  const prohibited = reconcilePromptHeadWithLiveHead(input({ attempted_blocker: prohibitedBlocker }));
  assert(!prohibited.ok, "old repaired-head blocker must be rejected after resolved boundary");
  assert(
    prohibited.action === "block_stale_prompt_head",
    `expected stale prompt-head block, got ${prohibited.action}`,
  );

  const failingLiveStatus = reconcilePromptHeadWithLiveHead(
    input({
      live_status_surface: {
        verdict: "failing",
        ok: false,
        decisive_successes: [],
        blocking_failures: ["Route governor proof surface failed on live head fd0ddbaf906df4630bac271ddc804e3d1b7658fd"],
        pending_surfaces: [],
        non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
      },
    }),
  );
  assert(!failingLiveStatus.ok, "failing live-head status should block release");
  assert(
    failingLiveStatus.action === "repair_live_head_failure",
    `expected live-head repair, got ${failingLiveStatus.action}`,
  );
  assert(failingLiveStatus.warnings.length === 1, "Node.js 20 notice must remain a warning");

  const resolvedLivePrompt = reconcilePromptHeadWithLiveHead(
    input({
      prompt_head_sha: repairedHead,
      live_head_sha: repairedHead,
    }),
  );
  assert(resolvedLivePrompt.ok, "live prompt head with resolved status should be accepted");
  assert(resolvedLivePrompt.action === "accept_prompt_head", `expected accept_prompt_head, got ${resolvedLivePrompt.action}`);
}

runPromptHeadReconciliationProof();
