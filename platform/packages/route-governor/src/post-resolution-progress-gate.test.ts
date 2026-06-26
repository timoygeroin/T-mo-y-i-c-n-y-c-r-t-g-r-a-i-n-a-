import assert from "node:assert/strict";
import test from "node:test";

import {
  gatePostResolutionProgress,
  type PostResolutionProgressGateInput,
} from "./post-resolution-progress-gate.js";

const BRANCH = "monday-platform-genesis-01";
const REPAIRED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const LIVE_HEAD = "72d30c7a6461c4082538b627e2d95045f9d70027";

function input(overrides: Partial<PostResolutionProgressGateInput> = {}): PostResolutionProgressGateInput {
  return {
    active_branch: BRANCH,
    live_head_sha: LIVE_HEAD,
    repaired_head_sha: REPAIRED_HEAD,
    last_status_readback_head_sha: REPAIRED_HEAD,
    resolved_boundary_ids: ["issue-1-ci-status-readback"],
    forbidden_repeat_classes: [
      "metadata_reread",
      "duplicate_ci_summary",
      "duplicate_comment",
      "duplicate_label",
      "local_memory_guard",
      "guessed_future_ci",
      "reclose_completed_blocker",
      "old_repaired_head_blocker",
    ],
    candidate: {
      candidate_id: "post-resolution-progress-gate",
      progress_class: "external_platform_embodiment",
      branch: BRANCH,
      base_head_sha: LIVE_HEAD,
      changed_files: ["platform/packages/route-governor/src/post-resolution-progress-gate.ts"],
      executable_artifacts: ["gatePostResolutionProgress"],
      routing_artifacts: ["retire repaired-head blockers after resolved boundary"],
      proof_artifacts: ["platform/packages/route-governor/src/post-resolution-progress-gate.test.ts"],
    },
    ...overrides,
  };
}

test("admits behavior-bearing post-resolution embodiment on the live head", () => {
  const verdict = gatePostResolutionProgress(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_external_platform_embodiment");
  assert.equal(verdict.admitted_progress_class, "external_platform_embodiment");
  assert.ok(verdict.retired_boundaries.includes(`repaired-head:${REPAIRED_HEAD}`));
  assert.ok(verdict.decisive_evidence.includes("gatePostResolutionProgress"));
});

test("blocks the old repaired-head blocker after boundary resolution", () => {
  const verdict = gatePostResolutionProgress(
    input({
      candidate: {
        ...input().candidate,
        candidate_id: "old-repaired-head-blocker",
        progress_class: "old_repaired_head_blocker",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        blocker: "repaired-head status readback for b38ea247602ae8ebba80c4120ad03b41b26bd841 is missing",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_non_progress");
});

test("blocks stale status readback when head and checks have not moved", () => {
  const verdict = gatePostResolutionProgress(
    input({
      live_head_sha: REPAIRED_HEAD,
      last_status_readback_head_sha: REPAIRED_HEAD,
      candidate: {
        ...input().candidate,
        progress_class: "fresh_status_readback",
        base_head_sha: REPAIRED_HEAD,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_status_readback");
});
