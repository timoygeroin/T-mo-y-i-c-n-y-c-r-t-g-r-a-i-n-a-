import assert from "node:assert/strict";
import { test } from "node:test";

import { queuePostStatusEmbodiment, type PostStatusEmbodimentQueueInput } from "./post-status-embodiment-queue.js";

const branch = "monday-platform-genesis-01";
const liveHead = "51e09f0d34de207c97b94a5ace77ef77247c48ea";

function input(overrides: Partial<PostStatusEmbodimentQueueInput> = {}): PostStatusEmbodimentQueueInput {
  return {
    branch,
    active_branch: branch,
    live_head_sha: liveHead,
    status_head_sha: liveHead,
    status_verdict: "passing",
    status_authority_action: "accept_live_status_evidence",
    non_blocking_warnings: [],
    spent_move_classes: [],
    spent_artifact_classes: [],
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

test("queues a new external embodiment after accepted live-head status", () => {
  const verdict = queuePostStatusEmbodiment(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "queue_external_embodiment");
  assert.equal(verdict.queued?.candidate_id, "post-status-runtime-execution-step");
  assert.deepEqual(verdict.blockers, []);
  assert.equal(verdict.queued?.required_status_head_after_commit, "new_head");
});

test("blocks PR body or prompt summaries from acting as live status authority", () => {
  const verdict = queuePostStatusEmbodiment(
    input({
      status_authority_action: "block_summary_as_status",
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_status_not_authoritative");
  assert.deepEqual(verdict.blockers, ["status authority did not accept live evidence: block_summary_as_status"]);
});

test("blocks stale status from an older repaired head", () => {
  const verdict = queuePostStatusEmbodiment(
    input({
      status_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_status_not_authoritative");
  assert.deepEqual(verdict.blockers, [
    `status evidence belongs to b38ea247602ae8ebba80c4120ad03b41b26bd841, not live head ${liveHead}`,
  ]);
});

test("blocks warning maintenance below external embodiment", () => {
  const verdict = queuePostStatusEmbodiment(
    input({
      non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
      candidate: {
        ...input().candidate!,
        candidate_id: "warning-maintenance-too-early",
        move_class: "warning_maintenance",
        artifact_class: "node20_warning_maintenance",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_warning_priority");
  assert.deepEqual(verdict.blockers, [
    "warning remains deferred below embodiment: Node.js 20 Actions deprecation notice",
  ]);
});

test("blocks non-progress substitutes after status is already accepted", () => {
  const verdict = queuePostStatusEmbodiment(
    input({
      candidate: {
        ...input().candidate!,
        candidate_id: "duplicate-ci-summary",
        move_class: "duplicate_ci_summary",
        artifact_class: "duplicate_summary",
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_move");
});

test("blocks repeated artifact classes", () => {
  const verdict = queuePostStatusEmbodiment(input({ spent_artifact_classes: ["post_status_embodiment_queue"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_artifact");
  assert.deepEqual(verdict.blockers, ["candidate artifact class is already spent: post_status_embodiment_queue"]);
});

test("blocks incomplete embodiment candidates", () => {
  const verdict = queuePostStatusEmbodiment(
    input({
      candidate: {
        ...input().candidate!,
        changed_files: ["platform/docs/readme.md"],
        executable_artifacts: [],
      },
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_candidate");
  assert.ok(verdict.blockers.includes("candidate does not change executable platform files"));
  assert.ok(verdict.blockers.includes("candidate has no executable artifact evidence"));
});
