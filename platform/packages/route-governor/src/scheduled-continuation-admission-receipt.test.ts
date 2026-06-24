import assert from "node:assert/strict";
import { test } from "node:test";

import {
  admitScheduledContinuation,
  type ScheduledContinuationAdmissionInput,
} from "./scheduled-continuation-admission.js";
import { compileScheduledContinuationAdmissionReceipt } from "./scheduled-continuation-admission-receipt.js";

const branch = "monday-platform-genesis-01";
const resolvedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "f8d63a29273dfca914660c44a65c919e8d4765c2";
const warning = "Node.js 20 Actions deprecation notice";

function input(overrides: Partial<ScheduledContinuationAdmissionInput> = {}): ScheduledContinuationAdmissionInput {
  return {
    active_branch: branch,
    prompt_head_sha: resolvedHead,
    live_head_sha: liveHead,
    last_readback_head_sha: resolvedHead,
    resolved_repaired_head_sha: resolvedHead,
    resolved_repaired_head_blockers: ["blocked: ci-status-readback"],
    move_class: "external_platform_embodiment",
    spent_move_classes: ["metadata_reread", "duplicate_status_summary"],
    spent_candidate_ids: [],
    status_surface: {
      head_sha: liveHead,
      verdict: "passing_with_warnings",
      check_run_ids: ["current-check"],
      blocking_failures: [],
      pending_surfaces: [],
      non_blocking_warnings: [warning],
    },
    embodiment: {
      candidate_id: "scheduled-admission-receipt",
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/scheduled-continuation-admission-receipt.ts"],
      executable_artifacts: ["compileScheduledContinuationAdmissionReceipt"],
      routing_artifacts: ["scheduled admission receipt compiler"],
      proof_artifacts: ["scheduled-continuation-admission-receipt.test.ts"],
    },
    ...overrides,
  };
}

test("compiles an admitted scheduled embodiment into a live-head receipt", () => {
  const admission = admitScheduledContinuation(input());
  const receipt = compileScheduledContinuationAdmissionReceipt({
    receipt_id: "scheduled-admission-receipt",
    active_branch: branch,
    live_head_sha: liveHead,
    admission,
  });

  assert.equal(receipt.ok, true);
  assert.equal(receipt.release_class, "external_platform_embodiment");
  assert.equal(receipt.head_sha, liveHead);
  assert.equal(receipt.quarantined_prompt_head, resolvedHead);
  assert.equal(receipt.admitted_candidate_id, "scheduled-admission-receipt");
  assert.ok(receipt.decisive_evidence.includes("compileScheduledContinuationAdmissionReceipt"));
  assert.deepEqual(receipt.warnings, [warning]);
});

test("blocks receipts whose admission does not target the live head", () => {
  const admission = admitScheduledContinuation(input());
  const receipt = compileScheduledContinuationAdmissionReceipt({
    receipt_id: "scheduled-admission-receipt",
    active_branch: branch,
    live_head_sha: "different-live-head",
    admission,
  });

  assert.equal(receipt.ok, false);
  assert.equal(receipt.release_class, "blocked");
  assert.ok(receipt.blockers.some((blocker) => blocker.includes("does not match live head")));
});

test("preserves blocked admission blockers instead of laundering them into progress", () => {
  const admission = admitScheduledContinuation(
    input({
      move_class: "metadata_reread",
      embodiment: undefined,
    }),
  );
  const receipt = compileScheduledContinuationAdmissionReceipt({
    receipt_id: "blocked-scheduled-admission",
    active_branch: branch,
    live_head_sha: liveHead,
    admission,
  });

  assert.equal(receipt.ok, false);
  assert.equal(receipt.release_class, "blocked");
  assert.deepEqual(receipt.decisive_evidence, []);
  assert.ok(receipt.blockers.some((blocker) => blocker.includes("metadata_reread")));
});

test("compiles moved-head readback admission without treating repaired-head history as current", () => {
  const admission = admitScheduledContinuation(
    input({
      move_class: "fresh_status_readback",
      embodiment: undefined,
    }),
  );
  const receipt = compileScheduledContinuationAdmissionReceipt({
    receipt_id: "moved-head-status-receipt",
    active_branch: branch,
    live_head_sha: liveHead,
    admission,
  });

  assert.equal(receipt.ok, true);
  assert.equal(receipt.release_class, "fresh_status_readback");
  assert.equal(receipt.quarantined_prompt_head, resolvedHead);
  assert.ok(receipt.decisive_evidence.some((line) => line.includes(`head moved from ${resolvedHead} to ${liveHead}`)));
});
