import assert from "node:assert/strict";

import { queuePostStatusEmbodiment, type PostStatusEmbodimentQueueInput } from "./post-status-embodiment-queue.js";

const branch = "monday-platform-genesis-01";
const liveHead = "51e09f0d34de207c97b94a5ace77ef77247c48ea";
const warning = "Node.js 20 Actions deprecation notice";

function input(overrides: Partial<PostStatusEmbodimentQueueInput> = {}): PostStatusEmbodimentQueueInput {
  return {
    branch,
    active_branch: branch,
    live_head_sha: liveHead,
    status_head_sha: liveHead,
    status_verdict: "passing_with_warnings",
    status_authority_action: "accept_live_status_evidence",
    non_blocking_warnings: [warning],
    spent_move_classes: ["fresh_status_readback", "metadata_reread"],
    spent_artifact_classes: ["warning_maintenance_router"],
    candidate: {
      candidate_id: "post-status-runtime-execution-step",
      move_class: "external_platform_embodiment",
      artifact_class: "post_status_embodiment_queue",
      changed_files: ["platform/packages/route-governor/src/post-status-embodiment-queue.ts"],
      executable_artifacts: ["queuePostStatusEmbodiment"],
      routing_artifacts: ["post-status embodiment queue"],
      proof_artifacts: ["dist/post-status-embodiment-queue-proof.js"],
      capability_axis: "runtime_execution",
    },
    ...overrides,
  };
}

const queued = queuePostStatusEmbodiment(input());
assert.equal(queued.ok, true);
assert.equal(queued.action, "queue_external_embodiment");
assert.equal(queued.queued?.required_status_head_after_commit, "new_head");
assert.match(queued.next_route, /fresh status readback/);

const staleStatus = queuePostStatusEmbodiment(input({ status_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }));
assert.equal(staleStatus.ok, false);
assert.equal(staleStatus.action, "block_status_not_authoritative");

const warningMaintenance = queuePostStatusEmbodiment(
  input({
    candidate: {
      ...input().candidate!,
      candidate_id: "warning-maintenance-too-early",
      move_class: "warning_maintenance",
      artifact_class: "node20_warning_maintenance",
    },
  }),
);
assert.equal(warningMaintenance.ok, false);
assert.equal(warningMaintenance.action, "block_warning_priority");

const duplicateSummary = queuePostStatusEmbodiment(
  input({
    candidate: {
      ...input().candidate!,
      candidate_id: "duplicate-ci-summary",
      move_class: "duplicate_ci_summary",
      artifact_class: "duplicate_summary",
    },
  }),
);
assert.equal(duplicateSummary.ok, false);
assert.equal(duplicateSummary.action, "block_non_progress_move");

const repeatedArtifact = queuePostStatusEmbodiment(
  input({
    spent_artifact_classes: ["post_status_embodiment_queue"],
  }),
);
assert.equal(repeatedArtifact.ok, false);
assert.equal(repeatedArtifact.action, "block_repeated_artifact");

console.log("post-status embodiment queue proof passed");
