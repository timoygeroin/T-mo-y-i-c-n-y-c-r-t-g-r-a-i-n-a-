import assert from "node:assert/strict";

import { gateFinalizationDelivery, type FinalizationDeliveryGateInput } from "./finalization-delivery-gate.js";
import type { ScheduledFinalizationRunnerOutput } from "./finalization-runner.js";

const head = "post-delivery-head-sha";

function runner(overrides: Partial<ScheduledFinalizationRunnerOutput> = {}): ScheduledFinalizationRunnerOutput {
  return {
    ok: true,
    emission_class: "external_embodiment",
    exit_code: 0,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    delivery_target: "github_pr",
    run_id: "scheduled-run-001",
    summary: "external_embodiment accepted for monday-platform-genesis-01 at post-delivery-head-sha",
    payload: {
      action: "commit_executable_embodiment",
      decisive_evidence: [
        "platform/packages/route-governor/src/finalization-delivery-gate.ts",
        "finalization delivery gate executable artifact",
        "PR-bound delivery routing artifact",
      ],
      blockers: [],
      next_route: "after the branch moves, read only status surfaces bound to the new PR head",
    },
    ...overrides,
  };
}

function base(overrides: Partial<FinalizationDeliveryGateInput> = {}): FinalizationDeliveryGateInput {
  return {
    runner_output: runner(),
    active_pr: 2,
    target_pr: 2,
    active_branch: "monday-platform-genesis-01",
    target_branch: "monday-platform-genesis-01",
    allowed_delivery_targets: ["github_pr"],
    ...overrides,
  };
}

const accepted = gateFinalizationDelivery(base());
assert.equal(accepted.ok, true);
assert.equal(accepted.action, "publish_external_embodiment_to_pr");
assert.deepEqual(accepted.blockers, []);
assert.match(accepted.decisive_evidence.join("\n"), /PR #2/);
assert.match(accepted.next_route, /resulting live head/);

const statusReadback = gateFinalizationDelivery(
  base({
    runner_output: runner({
      emission_class: "live_head_status_readback",
      payload: {
        action: "read_live_head_status",
        decisive_evidence: ["new current-head check 27000000000"],
        blockers: [],
        next_route: "publish only a live-head status readback",
      },
    }),
  }),
);
assert.equal(statusReadback.ok, true);
assert.equal(statusReadback.action, "publish_live_head_status_to_pr");

const exactBlocker = gateFinalizationDelivery(
  base({
    runner_output: runner({
      emission_class: "exact_external_blocker",
      payload: {
        action: "emit_exact_external_blocker",
        decisive_evidence: ["GitHub branch write permission denied"],
        blockers: ["GitHub branch write permission denied"],
        next_route: "remove the named blocker before attempting another progress class",
      },
    }),
  }),
);
assert.equal(exactBlocker.ok, true);
assert.equal(exactBlocker.action, "publish_exact_blocker_to_pr");

const chatOnly = gateFinalizationDelivery(
  base({
    runner_output: runner({ delivery_target: "chat" }),
    allowed_delivery_targets: ["github_pr", "chat"],
  }),
);
assert.equal(chatOnly.ok, false);
assert.equal(chatOnly.action, "block_chat_only_progress");
assert.deepEqual(chatOnly.blockers, ["external_embodiment cannot be completed through chat; active sink is PR #2"]);

const wrongPr = gateFinalizationDelivery(base({ target_pr: 3 }));
assert.equal(wrongPr.ok, false);
assert.equal(wrongPr.action, "block_wrong_pr");
assert.deepEqual(wrongPr.blockers, ["delivery target PR #3 does not match active PR #2"]);

const wrongBranch = gateFinalizationDelivery(base({ target_branch: "main" }));
assert.equal(wrongBranch.ok, false);
assert.equal(wrongBranch.action, "block_wrong_branch");
assert.deepEqual(wrongBranch.blockers, [
  "delivery branch main / runner branch monday-platform-genesis-01 does not match active branch monday-platform-genesis-01",
]);

const blockedRunner = gateFinalizationDelivery(
  base({
    runner_output: runner({
      ok: false,
      emission_class: "blocked_non_progress",
      exit_code: 78,
      payload: {
        action: "block_non_progress",
        decisive_evidence: [],
        blockers: ["move class is explicitly non-progress: duplicate_comment"],
        next_route: "choose executable embodiment, fresh live-head readback, or one exact external blocker",
      },
    }),
  }),
);
assert.equal(blockedRunner.ok, false);
assert.equal(blockedRunner.action, "block_non_progress_delivery");
assert.deepEqual(blockedRunner.blockers, ["move class is explicitly non-progress: duplicate_comment"]);

console.log("finalization delivery gate proof passed");
