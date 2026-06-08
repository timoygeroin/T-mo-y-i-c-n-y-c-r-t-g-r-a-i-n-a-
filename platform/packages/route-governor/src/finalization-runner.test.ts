import test from "node:test";
import assert from "node:assert/strict";

import { compileScheduledFinalizationRunner } from "./finalization-runner.js";
import type { FinalizationProgressInput } from "./finalization-progress-contract.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "20b105a5c79954065d923a50523f078d2ebe11bd";
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
    routing_artifacts: ["scheduled finalization emission payload"],
    artifact_class: "scheduled-finalization-runner",
    spent_artifact_classes: [
      "github-status-readback-compiler",
      "continuation-receipt-replay-guard",
      "finalization-progress-contract",
    ],
    new_current_head_check_ids: [],
    prohibited_blockers: [repairedHeadBlocker],
    ...overrides,
  };
}

test("emits executable embodiment as a machine-readable scheduled-run payload", () => {
  const output = compileScheduledFinalizationRunner({
    progress: progress(),
    run_id: "scheduled-2026-06-08T08:04:01Z",
    delivery_target: "artifact",
  });

  assert.equal(output.ok, true);
  assert.equal(output.emission_class, "external_embodiment");
  assert.equal(output.exit_code, 0);
  assert.equal(output.payload.action, "commit_executable_embodiment");
  assert.ok(output.payload.decisive_evidence.includes("compileScheduledFinalizationRunner"));
  assert.ok(output.payload.next_route.includes("new PR head"));
  assert.equal(output.run_id, "scheduled-2026-06-08T08:04:01Z");
});

test("turns a moved-head readback route into an explicit readback emission", () => {
  const output = compileScheduledFinalizationRunner({
    progress: progress({
      move_class: "fresh_status_readback",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      status_surface: {
        head_sha: liveHead,
        evidence_ids: ["actions-run-27150000001"],
      },
    }),
    delivery_target: "github_pr",
  });

  assert.equal(output.ok, true);
  assert.equal(output.emission_class, "live_head_status_readback");
  assert.equal(output.payload.action, "read_live_head_status");
  assert.equal(output.delivery_target, "github_pr");
  assert.ok(output.payload.decisive_evidence.some((line) => line.includes("head moved")));
});

test("keeps the resolved repaired-head blocker prohibited in scheduled output", () => {
  const output = compileScheduledFinalizationRunner({
    progress: progress({
      move_class: "exact_external_blocker",
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      exact_blocker: repairedHeadBlocker,
    }),
  });

  assert.equal(output.ok, false);
  assert.equal(output.emission_class, "blocked_non_progress");
  assert.equal(output.exit_code, 78);
  assert.equal(output.payload.action, "block_non_progress");
  assert.ok(output.summary.includes("prohibited blocker"));
});

test("emits incomplete progress as a hard failure instead of a publishable action", () => {
  const output = compileScheduledFinalizationRunner({
    progress: progress({
      changed_files: ["platform/docs/manifestation-contract.md"],
      executable_artifacts: [],
      routing_artifacts: [],
    }),
  });

  assert.equal(output.ok, false);
  assert.equal(output.emission_class, "blocked_incomplete_progress");
  assert.equal(output.exit_code, 1);
  assert.ok(output.payload.blockers.includes("external embodiment does not change executable platform files"));
});
