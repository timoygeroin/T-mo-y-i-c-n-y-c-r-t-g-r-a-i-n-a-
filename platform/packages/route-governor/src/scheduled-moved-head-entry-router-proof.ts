import { routeScheduledMovedHeadEntry, type ScheduledMovedHeadEntryInput } from "./scheduled-moved-head-entry-router.js";

function baseInput(overrides: Partial<ScheduledMovedHeadEntryInput> = {}): ScheduledMovedHeadEntryInput {
  return {
    active_branch: "monday-platform-genesis-01",
    pr_branch: "monday-platform-genesis-01",
    prompt_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    live_head_sha: "51d7536baff997c7bef25632d24ddfe37a547b0e",
    last_status_readback_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    resolved_repaired_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    exhausted_route_signatures: ["duplicate-status-summary", "memory-only-guard"],
    prohibited_progress_classes: ["metadata_reread", "duplicate_ci_summary", "duplicate_comment", "local_memory_guard"],
    candidate: {
      candidate_id: "scheduled-moved-head-entry-router",
      progress_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: "51d7536baff997c7bef25632d24ddfe37a547b0e",
      changed_files: ["platform/packages/route-governor/src/scheduled-moved-head-entry-router.ts"],
      executable_artifacts: ["routeScheduledMovedHeadEntry"],
      routing_artifacts: ["scheduled moved-head entry router"],
      proof_artifacts: ["platform/packages/route-governor/src/scheduled-moved-head-entry-router-proof.ts"],
      route_signature: "scheduled-moved-head-entry-router",
    },
    ...overrides,
  };
}

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) {
    throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
  }
}

function expectBlock(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) {
    throw new Error(`${name} should block, but passed`);
  }
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not block for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

const movedHeadWithoutStatus = routeScheduledMovedHeadEntry(baseInput());
expectOk("moved head without live status routes to readback", movedHeadWithoutStatus.ok, movedHeadWithoutStatus.blockers);
if (movedHeadWithoutStatus.action !== "read_live_head_status") {
  throw new Error(`expected read_live_head_status, received ${movedHeadWithoutStatus.action}`);
}
if (movedHeadWithoutStatus.quarantined_prompt_head_sha !== "b38ea247602ae8ebba80c4120ad03b41b26bd841") {
  throw new Error("prompt-carried repaired head was not quarantined");
}

const passingLiveStatus = routeScheduledMovedHeadEntry(
  baseInput({
    status_surface: {
      surface_id: "checks:51d7536",
      head_sha: "51d7536baff997c7bef25632d24ddfe37a547b0e",
      verdict: "passing_with_warnings",
      decisive_successes: ["Route governor proof examples succeeded on live head"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: ["Node.js 20 Actions deprecation warning"],
    },
  }),
);
expectOk("passing live status admits embodiment", passingLiveStatus.ok, passingLiveStatus.blockers);
if (passingLiveStatus.action !== "commit_live_head_embodiment") {
  throw new Error(`expected commit_live_head_embodiment, received ${passingLiveStatus.action}`);
}

const duplicateSummary = routeScheduledMovedHeadEntry(
  baseInput({
    candidate: {
      ...baseInput().candidate,
      progress_class: "duplicate_ci_summary",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
    },
  }),
);
expectBlock("duplicate CI summary", duplicateSummary.ok, duplicateSummary.blockers, "non-progress class");

const staleSurface = routeScheduledMovedHeadEntry(
  baseInput({
    status_surface: {
      surface_id: "checks:b38ea247",
      head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      verdict: "passing",
      decisive_successes: ["old repaired-head check success"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: [],
    },
  }),
);
expectBlock("stale status surface", staleSurface.ok, staleSurface.blockers, "not live head");

const proofOnlyCandidate = routeScheduledMovedHeadEntry(
  baseInput({
    prompt_head_sha: "51d7536baff997c7bef25632d24ddfe37a547b0e",
    last_status_readback_head_sha: "51d7536baff997c7bef25632d24ddfe37a547b0e",
    status_surface: {
      surface_id: "checks:51d7536",
      head_sha: "51d7536baff997c7bef25632d24ddfe37a547b0e",
      verdict: "passing",
      decisive_successes: ["Route governor proof examples succeeded on live head"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: [],
    },
    candidate: {
      ...baseInput().candidate,
      changed_files: ["platform/packages/route-governor/src/scheduled-moved-head-entry-router-proof.ts"],
    },
  }),
);
expectBlock("proof-only embodiment", proofOnlyCandidate.ok, proofOnlyCandidate.blockers, "proof-only");
