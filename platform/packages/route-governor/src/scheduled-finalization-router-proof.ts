import {
  routeScheduledFinalization,
  type ScheduledFinalizationInput,
} from "./scheduled-finalization-router.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "2dde891d4b8b9493785fed9e3a3c0ed1641c6ad6";
const repairedHeadBlocker = "repaired-head status readback is missing for b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<ScheduledFinalizationInput> = {}): ScheduledFinalizationInput {
  return {
    branch,
    active_branch: branch,
    prompt_head_sha: repairedHead,
    live_head_sha: liveHead,
    resolved_repaired_head_sha: repairedHead,
    resolved_repaired_head_status: true,
    move_class: "external_platform_embodiment",
    changed_files: ["platform/packages/route-governor/src/scheduled-finalization-router.ts"],
    executable_artifacts: ["routeScheduledFinalization"],
    routing_artifacts: ["scheduled finalization router"],
    prohibited_blockers: [repairedHeadBlocker],
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runScheduledFinalizationRouterProof(): void {
  const embodiment = routeScheduledFinalization(input());
  assert(embodiment.ok, "scheduled run should allow a new executable embodiment on the live head");
  assert(
    embodiment.action === "commit_external_embodiment",
    `expected commit_external_embodiment, got ${embodiment.action}`,
  );
  assert(!embodiment.prompt_head_allowed, "stale prompt-carried repaired head must not stay allowed");
  assert(
    embodiment.next_route.includes("new PR head"),
    "embodiment must route the next pass to moved-head status readback",
  );

  const prohibitedBlocker = routeScheduledFinalization(
    input({
      move_class: "exact_external_blocker",
      attempted_blocker: repairedHeadBlocker,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
    }),
  );
  assert(!prohibitedBlocker.ok, "old repaired-head blocker must be rejected");
  assert(
    prohibitedBlocker.action === "block_non_progress",
    `expected block_non_progress, got ${prohibitedBlocker.action}`,
  );

  const metadataReread = routeScheduledFinalization(
    input({
      move_class: "metadata_reread",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
    }),
  );
  assert(!metadataReread.ok, "metadata reread must not count as scheduled progress");

  const liveReadbackNeeded = routeScheduledFinalization(
    input({
      move_class: "fresh_status_readback",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
    }),
  );
  assert(liveReadbackNeeded.ok, "moved live head should allow a live-head status read route");
  assert(
    liveReadbackNeeded.action === "read_live_head_status",
    `expected read_live_head_status, got ${liveReadbackNeeded.action}`,
  );

  const failingLiveStatus = routeScheduledFinalization(
    input({
      move_class: "fresh_status_readback",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      live_status_surface: {
        head_sha: liveHead,
        verdict: "failing",
        evidence_ids: ["Monday Platform CI / Route governor proof surface"],
        blockers: ["Run proof examples failed on the live PR head"],
        warnings: ["Node.js 20 Actions deprecation notice"],
      },
    }),
  );
  assert(!failingLiveStatus.ok, "failing live-head status should block release");
  assert(
    failingLiveStatus.action === "repair_live_head_failure",
    `expected repair_live_head_failure, got ${failingLiveStatus.action}`,
  );
  assert(failingLiveStatus.warnings.length === 1, "Node.js 20 notice must remain a warning");

  const staleSurface = routeScheduledFinalization(
    input({
      move_class: "fresh_status_readback",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      live_status_surface: {
        head_sha: repairedHead,
        verdict: "passing",
        evidence_ids: ["old repaired-head check"],
        blockers: [],
        warnings: [],
      },
    }),
  );
  assert(!staleSurface.ok, "status surfaces from the repaired head must be rejected after the head moved");
}

runScheduledFinalizationRouterProof();
