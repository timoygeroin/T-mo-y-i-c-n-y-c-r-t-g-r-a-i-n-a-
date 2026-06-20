import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { routePostStatusFinalization, type PostStatusFinalizationInput } from "./post-status-finalization-router.js";

const liveHead = "21acec07f485b12f6933a1f894a035880e400a02";

function baseInput(overrides: Partial<PostStatusFinalizationInput> = {}): PostStatusFinalizationInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    repaired_historical_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    spent_action_ids: [],
    status_surface: {
      branch: "monday-platform-genesis-01",
      head_sha: liveHead,
      verdict: "passing_with_warnings",
      successful_surfaces: ["Route governor proof examples succeeded", "PR Head Status Readback succeeded"],
      warning_surfaces: ["Node.js 20 notice remains warning-only"],
      blocking_surfaces: [],
      pending_surfaces: [],
    },
    candidate: {
      action_id: "post-status-review-request",
      requested_action: "request_review",
      branch: "monday-platform-genesis-01",
      base_head_sha: liveHead,
      review_surface: "PR #2 ready-for-review surface",
      changed_files: [],
      behavior_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
    },
    ...overrides,
  };
}

describe("routePostStatusFinalization", () => {
  it("admits review request after passing current-head status with warning-only notices", () => {
    const verdict = routePostStatusFinalization(baseInput());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_review_request");
    assert.ok(verdict.warnings.includes("Node.js 20 notice remains warning-only"));
    assert.ok(verdict.retired_heads.includes("b38ea247602ae8ebba80c4120ad03b41b26bd841"));
  });

  it("blocks stale repaired-head status authority", () => {
    const verdict = routePostStatusFinalization(
      baseInput({
        status_surface: {
          ...baseInput().status_surface,
          head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_status_head");
    assert.match(verdict.decisive_evidence.join("; "), /b38ea247602ae8ebba80c4120ad03b41b26bd841/);
  });

  it("blocks warning maintenance as a post-status progress class", () => {
    const verdict = routePostStatusFinalization(
      baseInput({
        candidate: {
          ...baseInput().candidate,
          action_id: "warning-maintenance",
          requested_action: "warning_maintenance",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_warning_only_detour");
  });

  it("blocks duplicate status summaries after the status surface already passed", () => {
    const verdict = routePostStatusFinalization(
      baseInput({
        candidate: {
          ...baseInput().candidate,
          action_id: "duplicate-status-summary",
          requested_action: "duplicate_status_summary",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_non_progress_action");
  });

  it("blocks review request without a named review surface", () => {
    const verdict = routePostStatusFinalization(
      baseInput({
        candidate: {
          ...baseInput().candidate,
          review_surface: "",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_missing_review_surface");
  });

  it("admits merge command only with a named merge surface", () => {
    const verdict = routePostStatusFinalization(
      baseInput({
        candidate: {
          ...baseInput().candidate,
          action_id: "post-status-merge-command",
          requested_action: "merge_command",
          review_surface: undefined,
          merge_surface: "GitHub merge endpoint with expected head",
        },
      }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_merge_command");
    assert.match(verdict.next_route, /expected-head/);
  });

  it("admits next executable embodiment and routes back to post-write status escrow", () => {
    const verdict = routePostStatusFinalization(
      baseInput({
        candidate: {
          ...baseInput().candidate,
          action_id: "post-status-next-embodiment",
          requested_action: "external_platform_embodiment",
          review_surface: undefined,
          changed_files: ["platform/packages/route-governor/src/post-status-finalization-router.ts"],
          behavior_artifacts: ["routePostStatusFinalization"],
          routing_artifacts: ["post-status finalization router"],
          proof_artifacts: ["post-status-finalization-router.test.ts"],
        },
      }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_next_embodiment");
    assert.match(verdict.next_route, /post-write status escrow/);
  });
});
