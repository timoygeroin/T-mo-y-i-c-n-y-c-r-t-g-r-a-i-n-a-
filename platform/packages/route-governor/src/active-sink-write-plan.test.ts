import assert from "node:assert/strict";
import { test } from "node:test";

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

test("compiles ordered contents operations against the live PR head", () => {
  const verdict = compileActiveSinkWritePlan(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "compile_active_sink_write_plan");
  assert.equal(verdict.repository_full_name, repository);
  assert.equal(verdict.pr_number, pr);
  assert.equal(verdict.head_sha, liveHead);
  assert.deepEqual(verdict.quarantined_head_shas, [repairedHead]);
  assert.deepEqual(verdict.operations.map((operation) => operation.expected_head_sha), [liveHead]);
});

test("blocks stale repaired-head candidates before connector writes", () => {
  const verdict = compileActiveSinkWritePlan(input({ candidate: candidate({ base_head_sha: repairedHead }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_candidate_head");
  assert.deepEqual(verdict.blockers, [`active sink candidate base ${repairedHead} is not live head ${liveHead}`]);
});

test("blocks replaying the resolved repaired-head blocker", () => {
  const verdict = compileActiveSinkWritePlan(
    input({
      candidate: candidate({
        move_class: "exact_external_blocker",
        mutations: [],
        blocker: `old repaired-head status-readback blocker for ${repairedHead}`,
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_repaired_head_blocker");
});

test("admits live-head status readback only with a status surface id", () => {
  const admitted = compileActiveSinkWritePlan(
    input({
      candidate: candidate({
        move_class: "fresh_status_readback",
        mutations: [],
        status_surface_ids: ["actions-run-27100000000"],
      }),
    }),
  );
  assert.equal(admitted.ok, true);
  assert.equal(admitted.action, "route_live_head_status_readback");

  const blocked = compileActiveSinkWritePlan(
    input({ candidate: candidate({ move_class: "fresh_status_readback", mutations: [] }) }),
  );
  assert.equal(blocked.ok, false);
  assert.equal(blocked.action, "block_incomplete_write_plan");
});

test("blocks repeated plan ids, duplicate paths, and incomplete updates", () => {
  const repeated = compileActiveSinkWritePlan(input({ spent_plan_ids: ["active-sink-write-plan-01"] }));
  assert.equal(repeated.ok, false);
  assert.deepEqual(repeated.blockers, ["active sink write plan already spent: active-sink-write-plan-01"]);

  const duplicatePath = compileActiveSinkWritePlan(
    input({ candidate: candidate({ mutations: [mutation(), mutation({ mutation_id: "duplicate" })] }) }),
  );
  assert.equal(duplicatePath.ok, false);
  assert.deepEqual(duplicatePath.blockers, ["active sink write plan repeats path: platform/packages/route-governor/src/active-sink-write-plan.ts"]);

  const incompleteUpdate = compileActiveSinkWritePlan(
    input({ candidate: candidate({ mutations: [mutation({ kind: "update_file", current_blob_sha: undefined })] }) }),
  );
  assert.equal(incompleteUpdate.ok, false);
  assert.deepEqual(incompleteUpdate.blockers, ["active sink update active-sink-write-plan-source has no current blob sha"]);
});
