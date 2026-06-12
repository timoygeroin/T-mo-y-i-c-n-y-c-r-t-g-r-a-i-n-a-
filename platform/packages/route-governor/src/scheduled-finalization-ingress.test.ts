import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compileScheduledFinalizationIngress,
  type ScheduledFinalizationIngressInput,
} from "./scheduled-finalization-ingress.js";

const branch = "monday-platform-genesis-01";
const liveHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<ScheduledFinalizationIngressInput> = {}): ScheduledFinalizationIngressInput {
  return {
    active_branch: branch,
    instruction_branch: branch,
    instruction_head_sha: liveHead,
    live_pr: {
      branch,
      head_sha: liveHead,
      state: "open",
      draft: false,
      mergeable: true,
    },
    latest_receipt: {
      receipt_id: "resolved-head-ready",
      branch,
      head_sha: liveHead,
      progress_class: "fresh_status_readback",
    },
    resolved_repaired_head_sha: liveHead,
    prohibited_progress_classes: ["metadata_reread", "duplicate_ci_summary", "old_repaired_head_blocker"],
    ...overrides,
  };
}

test("admits scheduled finalization when live PR metadata and latest receipt agree", () => {
  const verdict = compileScheduledFinalizationIngress(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_scheduled_finalization_ingress");
  assert.equal(verdict.admitted_receipt_id, "resolved-head-ready");
  assert.ok(verdict.decisive_evidence.includes(`live head ${liveHead}`));
});

test("quarantines stale instruction head without treating it as current", () => {
  const movedHead = "06790fc3f0eb5fd05d614ae711d6567ac352d831";
  const verdict = compileScheduledFinalizationIngress(
    input({
      instruction_head_sha: liveHead,
      live_pr: {
        branch,
        head_sha: movedHead,
        state: "open",
        draft: false,
        mergeable: true,
      },
      latest_receipt: {
        receipt_id: "embodiment-increment-planner",
        branch,
        head_sha: movedHead,
        progress_class: "external_platform_embodiment",
      },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.head_sha, movedHead);
  assert.equal(verdict.quarantined_instruction_head_sha, liveHead);
  assert.ok(verdict.decisive_evidence.includes(`quarantined instruction head ${liveHead}`));
});

test("blocks missing live PR metadata", () => {
  const verdict = compileScheduledFinalizationIngress(input({ live_pr: undefined }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_live_pr_metadata");
  assert.deepEqual(verdict.blockers, ["scheduled finalization ingress has no live PR metadata"]);
});

test("blocks branch mismatch before route choice", () => {
  const verdict = compileScheduledFinalizationIngress(
    input({
      live_pr: {
        branch: "other-branch",
        head_sha: liveHead,
        state: "open",
        draft: false,
        mergeable: true,
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_branch_mismatch");
  assert.deepEqual(verdict.blockers, [`live PR branch other-branch does not match active branch ${branch}`]);
});

test("blocks draft or closed PR state", () => {
  const verdict = compileScheduledFinalizationIngress(
    input({
      live_pr: {
        branch,
        head_sha: liveHead,
        state: "closed",
        draft: true,
        mergeable: true,
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_inactive_pr_state");
  assert.deepEqual(verdict.blockers, ["live PR state is closed", "live PR is still draft"]);
});

test("blocks stale latest receipt head", () => {
  const movedHead = "06790fc3f0eb5fd05d614ae711d6567ac352d831";
  const verdict = compileScheduledFinalizationIngress(
    input({
      live_pr: {
        branch,
        head_sha: movedHead,
        state: "open",
        draft: false,
        mergeable: true,
      },
      latest_receipt: {
        receipt_id: "old-receipt",
        branch,
        head_sha: liveHead,
        progress_class: "fresh_status_readback",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_latest_receipt");
  assert.deepEqual(verdict.blockers, [`latest receipt head ${liveHead} does not match live head ${movedHead}`]);
});

test("blocks prohibited progress classes in the latest receipt", () => {
  const verdict = compileScheduledFinalizationIngress(
    input({
      latest_receipt: {
        receipt_id: "metadata-reread",
        branch,
        head_sha: liveHead,
        progress_class: "metadata_reread",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_prohibited_progress_class");
  assert.deepEqual(verdict.blockers, ["latest receipt carries prohibited progress class: metadata_reread"]);
});
