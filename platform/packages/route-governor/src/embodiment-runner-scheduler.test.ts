import assert from "node:assert/strict";
import { test } from "node:test";

import {
  scheduleEmbodimentRunner,
  type EmbodimentRunnerCandidate,
  type EmbodimentRunnerSchedulerInput,
} from "./embodiment-runner-scheduler.js";

const branch = "monday-platform-genesis-01";
const head = "85a148ecb482f9226265afdefb30b25b467b51dd";

function candidate(overrides: Partial<EmbodimentRunnerCandidate> = {}): EmbodimentRunnerCandidate {
  return {
    candidate_id: "runtime-next",
    branch,
    base_head_sha: head,
    move_class: "external_platform_embodiment",
    artifact_class: "embodiment-runner-scheduler",
    capability_axis: "runtime_execution",
    changed_files: ["platform/packages/route-governor/src/embodiment-runner-scheduler.ts"],
    executable_artifacts: ["scheduleEmbodimentRunner"],
    routing_artifacts: ["runner ticket binds execution to live head and resulting status readback"],
    proof_artifacts: ["dist/embodiment-runner-scheduler.test.js"],
    required_receipt_ids: ["receipt:live-head-intake"],
    blocked_by_receipt_ids: [],
    priority_weight: 10,
    estimated_runtime_ms: 50,
    ...overrides,
  };
}

function input(overrides: Partial<EmbodimentRunnerSchedulerInput> = {}): EmbodimentRunnerSchedulerInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    status_surface: "head_moved_since_status",
    completed_receipts: [
      {
        receipt_id: "receipt:live-head-intake",
        artifact_class: "current-surface-intake",
        head_sha: head,
      },
    ],
    spent_artifact_classes: ["warning-maintenance-router"],
    prohibited_move_classes: ["fresh_status_readback", "metadata_reread", "duplicate_ci_summary"],
    candidates: [candidate()],
    ...overrides,
  };
}

test("schedules the highest capability runnable embodiment candidate", () => {
  const verdict = scheduleEmbodimentRunner(
    input({
      candidates: [
        candidate({
          candidate_id: "proof-only",
          artifact_class: "proof-only-ticket",
          capability_axis: "proof_surface",
          priority_weight: 100,
        }),
        candidate(),
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "schedule_next_embodiment_runner");
  assert.equal(verdict.ticket?.candidate_id, "runtime-next");
  assert.equal(verdict.ticket?.base_head_sha, head);
  assert.equal(verdict.ticket?.next_status_expected, "resulting_head_after_ticket_execution");
});

test("blocks failing and pending live-head status surfaces before scheduling", () => {
  const failing = scheduleEmbodimentRunner(input({ status_surface: "failing" }));
  assert.equal(failing.ok, false);
  assert.equal(failing.action, "block_status_surface");
  assert.deepEqual(failing.blockers, [`live head ${head} has failing status surface`]);

  const pending = scheduleEmbodimentRunner(input({ status_surface: "pending" }));
  assert.equal(pending.ok, false);
  assert.equal(pending.action, "block_status_surface");
  assert.deepEqual(pending.blockers, [`live head ${head} status surface is pending`]);
});

test("rejects stale-head, duplicate-artifact, and non-progress candidates", () => {
  const verdict = scheduleEmbodimentRunner(
    input({
      candidates: [
        candidate({ candidate_id: "stale", base_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
        candidate({ candidate_id: "spent", artifact_class: "warning-maintenance-router" }),
        candidate({ candidate_id: "summary", move_class: "duplicate_ci_summary" }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_no_runnable_candidate");
  assert.equal(verdict.rejected.length, 3);
  assert.match(verdict.rejected[0]?.blockers.join("\n"), /does not match live head/);
  assert.match(verdict.rejected[1]?.blockers.join("\n"), /already spent/);
  assert.match(verdict.rejected[2]?.blockers.join("\n"), /not executable embodiment progress/);
});

test("requires dependency receipts and honors blocking receipts", () => {
  const missingRequired = scheduleEmbodimentRunner(
    input({
      completed_receipts: [],
      candidates: [candidate()],
    }),
  );
  assert.equal(missingRequired.ok, false);
  assert.match(missingRequired.rejected[0]?.blockers.join("\n"), /required receipt is missing/);

  const blockedByReceipt = scheduleEmbodimentRunner(
    input({
      completed_receipts: [
        {
          receipt_id: "receipt:live-head-intake",
          artifact_class: "current-surface-intake",
          head_sha: head,
        },
        {
          receipt_id: "receipt:do-not-run",
          artifact_class: "terminal-blocker",
          head_sha: head,
        },
      ],
      candidates: [candidate({ blocked_by_receipt_ids: ["receipt:do-not-run"] })],
    }),
  );
  assert.equal(blockedByReceipt.ok, false);
  assert.match(blockedByReceipt.rejected[0]?.blockers.join("\n"), /blocked by completed receipt/);
});
