import { compileScheduledFinalizationRunner } from "./finalization-runner.js";
import type { FinalizationProgressInput } from "./finalization-progress-contract.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "9b29c38b666d401fae635d1f91f92c19640497e3";
const repairedHeadBlocker = "repaired-head status readback is still missing for b38ea247602ae8ebba80c4120ad03b41b26bd841";

function progress(overrides: Partial<FinalizationProgressInput> = {}): FinalizationProgressInput {
  return {
    branch,
    active_branch: branch,
    prompt_head_sha: repairedHead,
    live_head_sha: liveHead,
    last_status_readback_head_sha: repairedHead,
    resolved_repaired_head_sha: repairedHead,
    resolved_repaired_head_succeeded: true,
    move_class: "external_platform_embodiment",
    changed_files: ["platform/packages/route-governor/src/finalization-runner.ts"],
    executable_artifacts: ["compileScheduledFinalizationRunner"],
    routing_artifacts: ["scheduled finalization runner proof surface"],
    artifact_class: "finalization-runner-proof-surface",
    spent_artifact_classes: [
      "github-status-readback-compiler",
      "continuation-receipt-replay-guard",
      "head-transition-lineage-guard",
      "embodiment-increment-planner",
      "proof-failure-repair-plan",
      "finalization-progress-contract",
    ],
    new_current_head_check_ids: [],
    prohibited_blockers: [repairedHeadBlocker],
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runFinalizationRunnerProof(): void {
  const embodiment = compileScheduledFinalizationRunner({
    progress: progress(),
    run_id: "scheduled-2026-06-08T09:04:01Z",
    delivery_target: "artifact",
  });

  assert(embodiment.ok, "runner should emit a valid external embodiment payload");
  assert(embodiment.emission_class === "external_embodiment", "runner must preserve embodiment class");
  assert(embodiment.exit_code === 0, "accepted embodiment must exit successfully");
  assert(
    embodiment.payload.decisive_evidence.includes("compileScheduledFinalizationRunner"),
    "runner payload must carry the executable artifact",
  );

  const prohibitedBlocker = compileScheduledFinalizationRunner({
    progress: progress({
      move_class: "exact_external_blocker",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      exact_blocker: repairedHeadBlocker,
    }),
    delivery_target: "chat",
  });

  assert(!prohibitedBlocker.ok, "resolved repaired-head blocker must stay blocked");
  assert(prohibitedBlocker.exit_code === 78, "non-progress blocker should use neutral failure exit");
  assert(
    prohibitedBlocker.emission_class === "blocked_non_progress",
    "resolved repaired-head blocker must not become a publishable blocker",
  );

  const incomplete = compileScheduledFinalizationRunner({
    progress: progress({
      changed_files: ["platform/docs/finalization.md"],
      executable_artifacts: [],
      routing_artifacts: [],
    }),
  });

  assert(!incomplete.ok, "incomplete embodiment must not be accepted");
  assert(incomplete.exit_code === 1, "incomplete executable progress should fail hard");
  assert(
    incomplete.emission_class === "blocked_incomplete_progress",
    "incomplete executable progress must be classified separately from non-progress",
  );
}

runFinalizationRunnerProof();
