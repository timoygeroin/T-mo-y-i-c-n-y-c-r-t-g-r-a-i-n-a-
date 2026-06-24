import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  compileFinalReviewHandoffSnapshot,
  type FinalReviewHandoffSnapshotInput,
} from "./final-review-handoff-snapshot.js";

const liveHead = "0672bb84ad602a55799149405869261986a5f631";

function baseInput(overrides: Partial<FinalReviewHandoffSnapshotInput> = {}): FinalReviewHandoffSnapshotInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    snapshot_id: "final-review-snapshot-001",
    spent_snapshot_ids: [],
    requested_action: "request_final_review",
    status: {
      surface_id: "public-checks-live-head",
      branch: "monday-platform-genesis-01",
      head_sha: liveHead,
      verdict: "warning_only",
      warnings: ["Node.js 20 Actions deprecation notice"],
      evidence: ["Route governor proof examples succeeded", "CI groups succeeded with warning-only notice"],
    },
    mergeability: {
      surface_id: "live-pr-metadata",
      branch: "monday-platform-genesis-01",
      head_sha: liveHead,
      mergeable: true,
      evidence: ["PR #2 mergeable true"],
    },
    blockers: {
      surface_id: "blocker-retirement-readback",
      branch: "monday-platform-genesis-01",
      head_sha: liveHead,
      verdict: "retired",
      blocker_ids: [],
      evidence: ["Issue #1 closed", "blocked: ci-status-readback removed"],
    },
    feedback: {
      surface_id: "review-feedback-delta",
      branch: "monday-platform-genesis-01",
      head_sha: liveHead,
      verdict: "none",
      reviewers: [],
      repair_items: [],
      evidence: ["no live-head changes requested surfaced"],
    },
    ...overrides,
  };
}

describe("compileFinalReviewHandoffSnapshot", () => {
  it("admits a single-head final review handoff with warning-only status", () => {
    const verdict = compileFinalReviewHandoffSnapshot(baseInput());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_final_review_handoff");
    assert.equal(verdict.head_sha, liveHead);
    assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
    assert.ok(verdict.decisive_evidence.includes("status successful"));
  });

  it("blocks a snapshot reused as fresh progress", () => {
    const verdict = compileFinalReviewHandoffSnapshot(
      baseInput({ spent_snapshot_ids: ["final-review-snapshot-001"] }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_reused_snapshot");
    assert.match(verdict.blockers.join("; "), /already spent/);
  });

  it("blocks mixed-head evidence before final review handoff", () => {
    const verdict = compileFinalReviewHandoffSnapshot(
      baseInput({
        status: {
          surface_id: "stale-repaired-head-checks",
          branch: "monday-platform-genesis-01",
          head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
          verdict: "success",
          warnings: [],
          evidence: ["seven repaired-head checks succeeded"],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_snapshot_head_mismatch");
    assert.match(verdict.next_route, /one live PR head/);
  });

  it("blocks pending or failing status", () => {
    const pending = compileFinalReviewHandoffSnapshot(
      baseInput({ status: { ...baseInput().status, verdict: "pending" } }),
    );
    const failing = compileFinalReviewHandoffSnapshot(
      baseInput({ status: { ...baseInput().status, verdict: "failure" } }),
    );

    assert.equal(pending.action, "block_status_not_successful");
    assert.equal(failing.action, "block_status_not_successful");
  });

  it("blocks active retired-head blocker residue", () => {
    const verdict = compileFinalReviewHandoffSnapshot(
      baseInput({
        blockers: {
          ...baseInput().blockers,
          verdict: "active",
          blocker_ids: ["blocked: ci-status-readback"],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_active_blocker");
  });

  it("blocks live review repair items before final review handoff", () => {
    const verdict = compileFinalReviewHandoffSnapshot(
      baseInput({
        feedback: {
          ...baseInput().feedback,
          verdict: "changes_requested",
          repair_items: ["platform/packages/route-governor/src/index.ts"],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_review_repair_needed");
    assert.match(verdict.next_route, /repair live-head review feedback/);
  });

  it("blocks metadata rereads and duplicate comments as non-progress consumers", () => {
    const verdict = compileFinalReviewHandoffSnapshot(baseInput({ requested_action: "metadata_reread" }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_progress_action");
  });
});
