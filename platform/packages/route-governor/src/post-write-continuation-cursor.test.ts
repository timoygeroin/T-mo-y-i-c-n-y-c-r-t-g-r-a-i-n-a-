import assert from "node:assert/strict";
import { test } from "node:test";

import { compilePostWriteContinuationCursor, type PostWriteContinuationCursorInput } from "./post-write-continuation-cursor.js";

const branch = "monday-platform-genesis-01";
const baseHead = "94024a55edab14e91142c14c44804bd76f72c533";
const movedHead = "post-write-head-001";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<PostWriteContinuationCursorInput> = {}): PostWriteContinuationCursorInput {
  return {
    active_branch: branch,
    live_head_sha: movedHead,
    prompt_head_sha: repairedHead,
    repaired_historical_heads: [repairedHead],
    spent_receipt_ids: [],
    receipt: {
      receipt_id: "post-write-continuation-cursor-001",
      branch,
      base_head_sha: baseHead,
      resulting_head_sha: movedHead,
      changed_files: ["platform/packages/route-governor/src/post-write-continuation-cursor.ts"],
      behavior_artifacts: ["compilePostWriteContinuationCursor"],
      routing_artifacts: ["post-write continuation cursor"],
    },
    authority_surfaces: [
      {
        surface_id: "live-pr-metadata",
        authority: "live_pr_metadata",
        branch,
        head_sha: movedHead,
        evidence: [`live head ${movedHead}`],
      },
      {
        surface_id: "scheduled-prompt-repaired-head",
        authority: "scheduled_prompt",
        branch,
        head_sha: repairedHead,
        evidence: [`prompt carried ${repairedHead}`],
      },
    ],
    candidate: {
      move_class: "external_platform_embodiment",
      branch,
      base_head_sha: movedHead,
    },
    ...overrides,
  };
}

test("inherits the moved post-write head and opens the status cursor", () => {
  const verdict = compilePostWriteContinuationCursor(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "inherit_moved_post_write_head");
  assert.equal(verdict.required_status_head_sha, movedHead);
  assert.deepEqual(verdict.accepted_surface_ids, ["live-pr-metadata"]);
  assert.ok(verdict.stale_surface_ids.includes("scheduled-prompt-repaired-head"));
});

test("routes to moved-head status readback without replaying the prompt head", () => {
  const verdict = compilePostWriteContinuationCursor(
    input({ candidate: { move_class: "fresh_status_readback", branch, base_head_sha: movedHead } }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "read_moved_head_status");
  assert.equal(verdict.required_status_head_sha, movedHead);
});

test("re-enters from a newer live head if another external write moved the branch", () => {
  const verdict = compilePostWriteContinuationCursor(
    input({
      live_head_sha: "newer-live-head",
      authority_surfaces: [
        {
          surface_id: "newer-live-pr-metadata",
          authority: "live_pr_metadata",
          branch,
          head_sha: "newer-live-head",
          evidence: ["another external write moved the PR head"],
        },
      ],
      candidate: { move_class: "external_platform_embodiment", branch, base_head_sha: "newer-live-head" },
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "reenter_from_newer_live_head");
  assert.equal(verdict.inherited_head_sha, "newer-live-head");
});

test("blocks prompt or memory summaries as the only continuation authority", () => {
  const verdict = compilePostWriteContinuationCursor(
    input({
      authority_surfaces: [
        {
          surface_id: "prompt-only",
          authority: "scheduled_prompt",
          branch,
          head_sha: movedHead,
          evidence: ["prompt repeated moved head"],
        },
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_summary_only_authority");
});

test("blocks historical repaired-head and proof-only write receipts", () => {
  const repairedResult = compilePostWriteContinuationCursor(
    input({
      live_head_sha: repairedHead,
      authority_surfaces: [
        {
          surface_id: "live-pr-repaired",
          authority: "live_pr_metadata",
          branch,
          head_sha: repairedHead,
          evidence: ["historical repaired head exposed as live"],
        },
      ],
      receipt: {
        receipt_id: "bad-repaired-result",
        branch,
        base_head_sha: baseHead,
        resulting_head_sha: repairedHead,
        changed_files: ["platform/packages/route-governor/src/post-write-continuation-cursor.ts"],
        behavior_artifacts: ["compilePostWriteContinuationCursor"],
        routing_artifacts: ["post-write continuation cursor"],
      },
      candidate: { move_class: "fresh_status_readback", branch, base_head_sha: repairedHead },
    }),
  );

  assert.equal(repairedResult.ok, false);
  assert.equal(repairedResult.action, "block_unmoved_or_historical_receipt");

  const proofOnly = compilePostWriteContinuationCursor(
    input({
      receipt: {
        receipt_id: "proof-only-receipt",
        branch,
        base_head_sha: baseHead,
        resulting_head_sha: movedHead,
        changed_files: ["platform/packages/route-governor/src/post-write-continuation-cursor-proof.ts"],
        behavior_artifacts: [],
        routing_artifacts: ["post-write continuation cursor"],
      },
    }),
  );

  assert.equal(proofOnly.ok, false);
  assert.equal(proofOnly.action, "block_non_behavior_receipt");
});
