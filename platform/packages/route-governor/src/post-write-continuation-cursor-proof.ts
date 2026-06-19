import assert from "node:assert/strict";

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

const inherited = compilePostWriteContinuationCursor(input());
assert.equal(inherited.ok, true);
assert.equal(inherited.action, "inherit_moved_post_write_head");
assert.equal(inherited.required_status_head_sha, movedHead);
assert.ok(inherited.stale_surface_ids.includes("scheduled-prompt-repaired-head"));

const status = compilePostWriteContinuationCursor(
  input({ candidate: { move_class: "fresh_status_readback", branch, base_head_sha: movedHead } }),
);
assert.equal(status.ok, true);
assert.equal(status.action, "read_moved_head_status");
assert.equal(status.required_status_head_sha, movedHead);

const newerLiveHead = compilePostWriteContinuationCursor(
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
assert.equal(newerLiveHead.ok, true);
assert.equal(newerLiveHead.action, "reenter_from_newer_live_head");
assert.equal(newerLiveHead.inherited_head_sha, "newer-live-head");

const promptOnly = compilePostWriteContinuationCursor(
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
assert.equal(promptOnly.ok, false);
assert.equal(promptOnly.action, "block_summary_only_authority");

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

const proofOnlyReceipt = compilePostWriteContinuationCursor(
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
assert.equal(proofOnlyReceipt.ok, false);
assert.equal(proofOnlyReceipt.action, "block_non_behavior_receipt");
