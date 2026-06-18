import assert from "node:assert/strict";

import { compileExternalWriteLease } from "./external-write-lease.js";
import { compileGithubContentsExecutionPreflight } from "./github-contents-execution-preflight.js";
import { compileGithubContentsMutationBatch } from "./github-contents-mutation-batch.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const branch = "monday-platform-genesis-01";
const liveHead = "github-contents-execution-preflight-head";
const behaviorFile = "platform/packages/route-governor/src/github-contents-execution-preflight.ts";
const proofFile = "platform/packages/route-governor/src/github-contents-execution-preflight-proof.ts";

const lease = compileExternalWriteLease({
  repository_full_name: repository,
  pr_number: 2,
  branch,
  active_branch: branch,
  observed_head_sha: liveHead,
  live_head_sha: liveHead,
  write_surface: "github_contents_create_file",
  write_class: "github_contents_execution_preflight",
  spent_write_classes: [],
  planned_files: [behaviorFile, proofFile],
  executable_artifacts: ["compileGithubContentsExecutionPreflight"],
  routing_artifacts: ["preflight serial GitHub contents operations before connector writes"],
  proof_artifacts: [proofFile],
});

const batch = compileGithubContentsMutationBatch({
  lease,
  active_branch: branch,
  live_head_sha: liveHead,
  batch_id: "github-contents-execution-preflight-batch",
  spent_batch_ids: [],
  mutations: [
    {
      mutation_id: "create-preflight-behavior",
      kind: "create_file",
      path: behaviorFile,
      commit_message: "Add GitHub contents execution preflight",
      content_source: "route-governor behavior artifact",
    },
    {
      mutation_id: "create-preflight-proof",
      kind: "create_file",
      path: proofFile,
      commit_message: "Add GitHub contents execution preflight proof",
      content_source: "route-governor proof artifact",
    },
  ],
});

const admitted = compileGithubContentsExecutionPreflight({
  batch,
  active_branch: branch,
  live_head_sha: liveHead,
  preflight_id: "github-contents-execution-preflight-proof",
  spent_preflight_ids: [],
});

assert.equal(admitted.ok, true);
assert.equal(admitted.action, "preflight_github_contents_execution");
assert.equal(admitted.branch, branch);
assert.equal(admitted.head_sha, liveHead);
assert.equal(admitted.operations.length, 2);
assert.equal(admitted.operations[0].lease_id, lease.lease_id);
assert.equal(admitted.operations[0].concurrency_key, batch.concurrency_key);
assert.ok(admitted.decisive_evidence.includes("compileGithubContentsExecutionPreflight"));

const stale = compileGithubContentsExecutionPreflight({
  batch,
  active_branch: branch,
  live_head_sha: "moved-head",
  preflight_id: "github-contents-execution-preflight-proof-stale",
  spent_preflight_ids: [],
});

assert.equal(stale.ok, false);
assert.equal(stale.action, "block_github_contents_execution_preflight");
assert.ok(stale.blockers.some((blocker) => blocker.includes("does not match live head moved-head")));

const replay = compileGithubContentsExecutionPreflight({
  batch,
  active_branch: branch,
  live_head_sha: liveHead,
  preflight_id: "github-contents-execution-preflight-proof",
  spent_preflight_ids: ["github-contents-execution-preflight-proof"],
});

assert.equal(replay.ok, false);
assert.ok(replay.blockers.includes("github contents execution preflight already spent: github-contents-execution-preflight-proof"));

console.log("github contents execution preflight proof passed");
