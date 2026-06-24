import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  routeReviewReadyTerminalBoundary,
  type ReviewReadyTerminalBoundaryInput,
  type ReviewReadyTerminalFeedbackSurface,
} from "./review-ready-terminal-boundary.js";

const branch = "monday-platform-genesis-01";
const head = "94b858263489f0b9e6abb92811fee46a733b40f5";

function feedback(overrides: Partial<ReviewReadyTerminalFeedbackSurface> = {}): ReviewReadyTerminalFeedbackSurface {
  return {
    feedback_id: "approval-1",
    reviewer: "external-reviewer",
    branch,
    head_sha: head,
    kind: "approval",
    ...overrides,
  };
}

function input(overrides: Partial<ReviewReadyTerminalBoundaryInput> = {}): ReviewReadyTerminalBoundaryInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    pr_is_draft: false,
    mergeable: true,
    required_approval_count: 1,
    requested_next_action: "wait_for_review",
    status_surface: {
      surface_id: "checks-94b8582",
      branch,
      head_sha: head,
      verdict: "passing_with_warnings",
      decisive_successes: ["Route Governor Proof succeeded", "Monday Platform CI succeeded"],
      blockers: [],
      warnings: ["Node.js 20 Actions deprecation notice"],
    },
    feedback_surfaces: [],
    ...overrides,
  };
}

describe("routeReviewReadyTerminalBoundary", () => {
  it("turns a ready-for-review PR with no feedback into an exact wait-for-review boundary", () => {
    const verdict = routeReviewReadyTerminalBoundary(input());

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "wait_for_external_review");
    assert.match(verdict.blockers.join("; "), /no live-head approval/);
    assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
  });

  it("blocks duplicate status summaries as non-progress after review readiness", () => {
    const verdict = routeReviewReadyTerminalBoundary(input({ requested_next_action: "duplicate_status_summary" }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_progress_action");
  });

  it("routes live-head changes-requested review feedback to bounded repair", () => {
    const verdict = routeReviewReadyTerminalBoundary(
      input({
        requested_next_action: "review_repair",
        feedback_surfaces: [
          feedback({
            feedback_id: "changes-1",
            kind: "changes_requested",
            file_paths: ["platform/packages/route-governor/src/review-ready-terminal-boundary.ts"],
          }),
        ],
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "route_review_changes_to_repair");
    assert.deepEqual(verdict.repair_feedback_ids, ["changes-1"]);
  });

  it("admits merge gate only with approval, mergeability, and live-head status", () => {
    const verdict = routeReviewReadyTerminalBoundary(
      input({
        requested_next_action: "merge_gate",
        feedback_surfaces: [feedback()],
      }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_merge_gate");
    assert.deepEqual(verdict.approvals, ["external-reviewer"]);
  });

  it("blocks merge gate without approval even when status is green", () => {
    const verdict = routeReviewReadyTerminalBoundary(input({ requested_next_action: "merge_gate" }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "wait_for_external_review");
    assert.match(verdict.blockers.join("; "), /requires 1 approval/);
  });

  it("blocks stale status surfaces before terminal routing", () => {
    const verdict = routeReviewReadyTerminalBoundary(
      input({
        status_surface: {
          ...input().status_surface,
          head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_status_surface");
  });

  it("admits a non-repeated embodiment only while review feedback has no stronger terminal route", () => {
    const verdict = routeReviewReadyTerminalBoundary(input({ requested_next_action: "external_platform_embodiment" }));

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "route_to_external_embodiment");
  });
});
