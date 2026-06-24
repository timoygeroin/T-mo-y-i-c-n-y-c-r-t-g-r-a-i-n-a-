import assert from "node:assert/strict";
import test from "node:test";

import { compileExternalWriteLease } from "./external-write-lease.js";
import { compileGithubContentsExecutionPreflight } from "./github-contents-execution-preflight.js";
import { compileGithubContentsMutationBatch } from "./github-contents-mutation-batch.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const branch = "monday-platform-genesis-01";
const head = "execution-preflight-live-head";
const behaviorFile = "platform/packages/route-governor/src/github-contents-execution-preflight.ts";
const proofFile = "platform/packages/route-governor/src/github-contents-execution-preflight-proof.ts";

function acceptedLease() {
  return compileExternalWriteLease({
    repository_full_name: repository,
    pr_number: 2,
    branch,
    active_branch: branch,
    observed_head_sha: head,
    live_head_sha: head,
    write_surface: "github_contents_create_file",
    write_class: "github_contents_execution_preflight",
    spent_write_classes: [],
    planned_files: [behaviorFile, proofFile],
    executable_artifacts: ["compileGithubContentsExecutionPreflight"],
    routing_artifacts: ["preflight serial GitHub contents operations before connector writes"],
    proof_artifacts: [proofFile],
  });
}

function acceptedBatch() {
  return compileGithubContentsMutationBatch({
    lease: acceptedLease(),
    active_branch: branch,
    live_head_sha: head,
    batch_id: "contents-batch-execution-preflight-001",
    spent_batch_ids: [],
    mutations: [
      {
        mutation_id: "create-execution-preflight",
        kind: "create_file",
        path: behaviorFile,
        commit_message: "Add GitHub contents execution preflight",
        content_source: "generated route-governor module",
      },
      {
        mutation_id: "create-execution-preflight-proof",
        kind: "create_file",
        path: proofFile,
        commit_message: "Add GitHub contents execution preflight proof",
        content_source: "generated route-governor proof",
      },
    ],
  });
}

test("preflights an accepted serial contents batch into head-bound operations", () => {
  const verdict = compileGithubContentsExecutionPreflight({
    batch: acceptedBatch(),
    active_branch: branch,
    live_head_sha: head,
    preflight_id: "contents-preflight-001",
    spent_preflight_ids: [],
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "preflight_github_contents_execution");
  assert.equal(verdict.operations.length, 2);
  assert.equal(verdict.operations[0].expected_head_sha, head);
  assert.equal(verdict.operations[0].repository_full_name, repository);
  assert.equal(verdict.operations[0].concurrency_key, `${branch}:${head}:contents-batch-execution-preflight-001`);
  assert.equal(verdict.blockers.length, 0);
});

test("blocks stale preflight when the PR head moved after batch compilation", () => {
  const verdict = compileGithubContentsExecutionPreflight({
    batch: acceptedBatch(),
    active_branch: branch,
    live_head_sha: "moved-live-head",
    preflight_id: "contents-preflight-002",
    spent_preflight_ids: [],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_github_contents_execution_preflight");
  assert.deepEqual(verdict.blockers, [`preflight batch head ${head} does not match live head moved-live-head`]);
});

test("blocks replayed preflight ids before another connector write plan", () => {
  const verdict = compileGithubContentsExecutionPreflight({
    batch: acceptedBatch(),
    active_branch: branch,
    live_head_sha: head,
    preflight_id: "contents-preflight-001",
    spent_preflight_ids: ["contents-preflight-001"],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.blockers.includes("github contents execution preflight already spent: contents-preflight-001"), true);
});

test("blocks proof-only mutation batches as non-behavioral progress", () => {
  const batch = compileGithubContentsMutationBatch({
    lease: acceptedLease(),
    active_branch: branch,
    live_head_sha: head,
    batch_id: "contents-batch-proof-only",
    spent_batch_ids: [],
    mutations: [
      {
        mutation_id: "create-proof-only",
        kind: "create_file",
        path: proofFile,
        commit_message: "Add proof only",
        content_source: "generated proof-only route",
      },
    ],
  });

  const verdict = compileGithubContentsExecutionPreflight({
    batch,
    active_branch: branch,
    live_head_sha: head,
    preflight_id: "contents-preflight-proof-only",
    spent_preflight_ids: [],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.blockers.includes("execution preflight has no behavior-bearing platform mutation"), true);
});

test("blocks non-serial ordered mutations before connector execution", () => {
  const batch = acceptedBatch();
  const tampered = {
    ...batch,
    ordered_mutations: batch.ordered_mutations.map((operation, index) =>
      index === 1 ? { ...operation, sequence: 4 } : operation,
    ),
  };

  const verdict = compileGithubContentsExecutionPreflight({
    batch: tampered,
    active_branch: branch,
    live_head_sha: head,
    preflight_id: "contents-preflight-nonserial",
    spent_preflight_ids: [],
  });

  assert.equal(verdict.ok, false);
  assert.equal(
    verdict.blockers.includes("operation create-execution-preflight-proof sequence 4 is not serial position 2"),
    true,
  );
});
