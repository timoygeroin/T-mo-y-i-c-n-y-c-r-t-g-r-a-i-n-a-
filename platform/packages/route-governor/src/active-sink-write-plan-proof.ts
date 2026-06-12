import assert from "node:assert/strict";

import {
  compileActiveSinkWritePlan,
  type ActiveSinkMutationCandidate,
  type ActiveSinkWriteCandidate,
  type ActiveSinkWritePlanInput,
} from "./active-sink-write-plan.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const pr = 2;
const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "cbcc50df188f01c64c0bba73dc05cbf7ad1bffad";

function mutation(overrides: Partial<ActiveSinkMutationCandidate> = {}): ActiveSinkMutationCandidate {
  return {
    mutation_id: "active-sink-write-plan-source",
    kind: "create_file",
    path: "platform/packages/route-governor/src/active-sink-write-plan.ts",
    commit_message: "Add active sink write plan admission",
    content_ref: "generated TypeScript source",
    executable_artifact: "compileActiveSinkWritePlan",
    routing_artifact: "active sink writes must bind to the live PR head",
    ...overrides,
  };
}

function candidate(overrides: Partial<ActiveSinkWriteCandidate> = {}): ActiveSinkWriteCandidate {
  return {
    move_class: "external_platform_embodiment",
    plan_id: "active-sink-write-plan-01",
    base_head_sha: liveHead,
    mutations: [mutation()],
    status_surface_ids: [],
    ...overrides,
  };
}

function input(overrides: Partial<ActiveSinkWritePlanInput> = {}): ActiveSinkWritePlanInput {
  return {
    repository_full_name: repository,
    pr_number: pr,
    active_branch: branch,
    pr_branch: branch,
    instruction_head_sha: repairedHead,
    live_head_sha: liveHead,
    resolved_repaired_head_sha: repairedHead,
    repaired_head_status_resolved: true,
    blocker_issue_closed: true,
    blocker_label_present: false,
    spent_plan_ids: [],
    candidate: candidate(),
    ...overrides,
  };
}

const admitted = compileActiveSinkWritePlan(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "compile_active_sink_write_plan");
assert.equal(admitted.head_sha, liveHead);
assert.deepEqual(admitted.quarantined_head_shas, [repairedHead]);
assert.deepEqual(
  admitted.operations.map((operation) => `${operation.sequence}:${operation.method}:${operation.path}:${operation.expected_head_sha}`),
  [`1:create_file:platform/packages/route-governor/src/active-sink-write-plan.ts:${liveHead}`],
);
assert.match(admitted.next_route, /moved head/);

const staleBase = compileActiveSinkWritePlan(
  input({
    candidate: candidate({ base_head_sha: repairedHead }),
  }),
);
assert.equal(staleBase.ok, false);
assert.equal(staleBase.action, "block_stale_candidate_head");
assert.deepEqual(staleBase.blockers, [`active sink candidate base ${repairedHead} is not live head ${liveHead}`]);

const replayedBlocker = compileActiveSinkWritePlan(
  input({
    candidate: candidate({
      move_class: "exact_external_blocker",
      mutations: [],
      blocker: `old repaired-head status-readback blocker for ${repairedHead}`,
    }),
  }),
);
assert.equal(replayedBlocker.ok, false);
assert.equal(replayedBlocker.action, "block_replayed_repaired_head_blocker");

const nonProgress = compileActiveSinkWritePlan(
  input({
    candidate: candidate({ move_class: "duplicate_ci_summary", mutations: [] }),
  }),
);
assert.equal(nonProgress.ok, false);
assert.equal(nonProgress.action, "block_non_progress_move");

const statusReadback = compileActiveSinkWritePlan(
  input({
    candidate: candidate({
      move_class: "fresh_status_readback",
      mutations: [],
      status_surface_ids: ["actions-run-27100000000"],
    }),
  }),
);
assert.equal(statusReadback.ok, true);
assert.equal(statusReadback.action, "route_live_head_status_readback");
assert.deepEqual(statusReadback.operations, []);

const missingStatusSurface = compileActiveSinkWritePlan(
  input({
    candidate: candidate({ move_class: "fresh_status_readback", mutations: [] }),
  }),
);
assert.equal(missingStatusSurface.ok, false);
assert.equal(missingStatusSurface.action, "block_incomplete_write_plan");

const exactBlocker = compileActiveSinkWritePlan(
  input({
    candidate: candidate({
      move_class: "exact_external_blocker",
      mutations: [],
      blocker: "GitHub contents API rejected the live branch write",
    }),
  }),
);
assert.equal(exactBlocker.ok, true);
assert.equal(exactBlocker.action, "emit_live_head_blocker");

const duplicatePath = compileActiveSinkWritePlan(
  input({
    candidate: candidate({
      mutations: [mutation(), mutation({ mutation_id: "duplicate" })],
    }),
  }),
);
assert.equal(duplicatePath.ok, false);
assert.deepEqual(duplicatePath.blockers, ["active sink write plan repeats path: platform/packages/route-governor/src/active-sink-write-plan.ts"]);

const incompleteUpdate = compileActiveSinkWritePlan(
  input({
    candidate: candidate({
      mutations: [mutation({ kind: "update_file", current_blob_sha: undefined })],
    }),
  }),
);
assert.equal(incompleteUpdate.ok, false);
assert.deepEqual(incompleteUpdate.blockers, ["active sink update active-sink-write-plan-source has no current blob sha"]);

console.log("active sink write plan proof passed");
