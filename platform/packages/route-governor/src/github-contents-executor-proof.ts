import assert from "node:assert/strict";

import {
  compileGithubContentsExecutorPlan,
  type GithubContentsExecutorInput,
} from "./github-contents-executor.js";
import type { RuntimeExecutionQueueVerdict } from "./runtime-execution-queue.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const pr = 2;
const branch = "monday-platform-genesis-01";
const head = "8a8f58cbdf2864cd92942aff03ba6171a68b6a5a";

function queue(overrides: Partial<RuntimeExecutionQueueVerdict> = {}): RuntimeExecutionQueueVerdict {
  return {
    ok: true,
    action: "enqueue_external_embodiment",
    repository_full_name: repository,
    pr_number: pr,
    branch,
    head_sha: head,
    executor_id: "runtime-execution-queue",
    steps: [
      {
        step_id: "verify-live-head",
        kind: "verify_live_head",
        command: `verify ${branch}@${head}`,
        required_before_release: true,
        rollback_on_failure: false,
      },
      {
        step_id: "write-external-embodiment",
        kind: "write_branch",
        command: `write ${branch}@${head} through github_contents_update_file`,
        required_before_release: true,
        rollback_on_failure: true,
      },
      {
        step_id: "record-execution-receipt",
        kind: "record_receipt",
        command: "record external embodiment receipt",
        required_before_release: true,
        rollback_on_failure: false,
      },
    ],
    decisive_evidence: ["runtime-execution-queue", "github_contents_update_file"],
    blockers: [],
    next_route: "execute queued branch write, record receipt, then read the moved-head status surface",
    ...overrides,
  };
}

function input(overrides: Partial<GithubContentsExecutorInput> = {}): GithubContentsExecutorInput {
  return {
    queue: queue(),
    active_branch: branch,
    live_head_sha: head,
    executor_plan_id: "github-contents-executor",
    spent_executor_plan_ids: ["runtime-execution-queue"],
    mutations: [
      {
        mutation_id: "executor-source",
        kind: "create_file",
        path: "platform/packages/route-governor/src/github-contents-executor.ts",
        commit_message: "Add GitHub contents executor route",
        content_source: "connector create_file payload",
      },
      {
        mutation_id: "package-export",
        kind: "update_file",
        path: "platform/packages/route-governor/package.json",
        commit_message: "Expose GitHub contents executor route",
        content_source: "package export and proof script wiring",
        current_blob_sha: "package-json-sha",
      },
    ],
    ...overrides,
  };
}

const accepted = compileGithubContentsExecutorPlan(input());
assert.equal(accepted.ok, true);
assert.equal(accepted.action, "execute_github_contents_writes");
assert.deepEqual(
  accepted.operations.map((operation) => operation.method),
  ["create_file", "update_file"],
);
assert.equal(accepted.operations[1]?.current_blob_sha, "package-json-sha");
assert.match(accepted.next_route, /moved PR head status/);

const staleHead = compileGithubContentsExecutorPlan(input({ live_head_sha: "newer-head" }));
assert.equal(staleHead.ok, false);
assert.deepEqual(staleHead.blockers, [`queue head ${head} does not match live head newer-head`]);

const repeatedPlan = compileGithubContentsExecutorPlan(
  input({ spent_executor_plan_ids: ["github-contents-executor"] }),
);
assert.equal(repeatedPlan.ok, false);
assert.deepEqual(repeatedPlan.blockers, ["github contents executor plan already spent: github-contents-executor"]);

const missingSha = compileGithubContentsExecutorPlan(
  input({
    mutations: [
      {
        mutation_id: "package-export",
        kind: "update_file",
        path: "platform/packages/route-governor/package.json",
        commit_message: "Expose GitHub contents executor route",
        content_source: "package export and proof script wiring",
      },
    ],
  }),
);
assert.equal(missingSha.ok, false);
assert.deepEqual(missingSha.blockers, ["github contents update package-export has no current blob sha"]);

const nonExecutable = compileGithubContentsExecutorPlan(
  input({
    mutations: [
      {
        mutation_id: "doc-only",
        kind: "create_file",
        path: "platform/docs/github-contents-executor.md",
        commit_message: "Document executor route",
        content_source: "doc payload",
      },
    ],
  }),
);
assert.equal(nonExecutable.ok, false);
assert(nonExecutable.blockers.includes("github contents executor has no executable platform mutation"));

const statusQueue = compileGithubContentsExecutorPlan(
  input({
    queue: queue({
      action: "enqueue_status_publication",
      steps: [],
      decisive_evidence: ["current-head status succeeded"],
    }),
    mutations: [],
  }),
);
assert.equal(statusQueue.ok, true);
assert.equal(statusQueue.action, "publish_without_contents_write");
assert.deepEqual(statusQueue.operations, []);

console.log("github contents executor proof passed");
