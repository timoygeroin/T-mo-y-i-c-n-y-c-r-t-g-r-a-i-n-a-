import assert from "node:assert/strict";

import type { ExternalWriteLeaseVerdict } from "./external-write-lease.js";
import type { GithubContentsMutation } from "./github-contents-executor.js";
import { compileGithubContentsMutationBatch } from "./github-contents-mutation-batch.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const pr = 2;
const branch = "monday-platform-genesis-01";
const head = "52c1ae2b57aadd5f799e09c8cc06b47e083b2813";

function lease(overrides: Partial<ExternalWriteLeaseVerdict> = {}): ExternalWriteLeaseVerdict {
  return {
    ok: true,
    action: "accept_write_lease",
    repository_full_name: repository,
    pr_number: pr,
    branch,
    head_sha: head,
    lease_id: `${repository}|pr-${pr}|${branch}|${head}|github-contents-mutation-batch`,
    next_status_expected_head: head,
    decisive_evidence: ["accepted write lease", "github-contents-mutation-batch"],
    blockers: [],
    next_route: "execute the leased branch write",
    ...overrides,
  };
}

function mutation(overrides: Partial<GithubContentsMutation> = {}): GithubContentsMutation {
  return {
    mutation_id: "create-mutation-batch",
    kind: "create_file",
    path: "platform/packages/route-governor/src/github-contents-mutation-batch.ts",
    commit_message: "Add GitHub contents mutation batch compiler",
    content_source: "workspace generated TypeScript source",
    ...overrides,
  };
}

const compiled = compileGithubContentsMutationBatch({
  lease: lease(),
  active_branch: branch,
  live_head_sha: head,
  batch_id: "github-contents-mutation-batch-01",
  spent_batch_ids: [],
  mutations: [mutation(), mutation({ mutation_id: "update-index", kind: "update_file", path: "platform/packages/route-governor/src/index.ts", current_blob_sha: "index-sha" })],
});
assert.equal(compiled.ok, true);
assert.equal(compiled.action, "compile_serial_contents_batch");
assert.equal(compiled.concurrency_key, `${branch}:${head}:github-contents-mutation-batch-01`);
assert.deepEqual(
  compiled.ordered_mutations.map((entry) => `${entry.sequence}:${entry.kind}:${entry.path}`),
  [
    "1:create_file:platform/packages/route-governor/src/github-contents-mutation-batch.ts",
    "2:update_file:platform/packages/route-governor/src/index.ts",
  ],
);
assert.match(compiled.next_route, /serially/);

const duplicatePath = compileGithubContentsMutationBatch({
  lease: lease(),
  active_branch: branch,
  live_head_sha: head,
  batch_id: "duplicate-path-batch",
  spent_batch_ids: [],
  mutations: [mutation(), mutation({ mutation_id: "same-path" })],
});
assert.equal(duplicatePath.ok, false);
assert.deepEqual(duplicatePath.blockers, [
  "contents mutation batch repeats path: platform/packages/route-governor/src/github-contents-mutation-batch.ts",
]);

const repeatedBatch = compileGithubContentsMutationBatch({
  lease: lease(),
  active_branch: branch,
  live_head_sha: head,
  batch_id: "github-contents-mutation-batch-01",
  spent_batch_ids: ["github-contents-mutation-batch-01"],
  mutations: [mutation()],
});
assert.equal(repeatedBatch.ok, false);
assert.deepEqual(repeatedBatch.blockers, ["contents mutation batch already spent: github-contents-mutation-batch-01"]);

const staleLease = compileGithubContentsMutationBatch({
  lease: lease({ head_sha: "old-head" }),
  active_branch: branch,
  live_head_sha: head,
  batch_id: "stale-head-batch",
  spent_batch_ids: [],
  mutations: [mutation()],
});
assert.equal(staleLease.ok, false);
assert.deepEqual(staleLease.blockers, [`mutation batch lease head old-head does not match live head ${head}`]);

const incompleteUpdate = compileGithubContentsMutationBatch({
  lease: lease(),
  active_branch: branch,
  live_head_sha: head,
  batch_id: "incomplete-update-batch",
  spent_batch_ids: [],
  mutations: [mutation({ kind: "update_file", current_blob_sha: undefined })],
});
assert.equal(incompleteUpdate.ok, false);
assert.deepEqual(incompleteUpdate.blockers, ["contents update create-mutation-batch has no current blob sha"]);

const noExecutableMutation = compileGithubContentsMutationBatch({
  lease: lease(),
  active_branch: branch,
  live_head_sha: head,
  batch_id: "docs-only-batch",
  spent_batch_ids: [],
  mutations: [mutation({ path: "platform/docs/mutation-batch.md" })],
});
assert.equal(noExecutableMutation.ok, false);
assert.deepEqual(noExecutableMutation.blockers, ["contents mutation batch has no executable platform mutation"]);

console.log("github contents mutation batch proof passed");
