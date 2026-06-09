import assert from "node:assert/strict";

import { compileExternalWriteLease, type ExternalWriteLeaseInput } from "./external-write-lease.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const branch = "monday-platform-genesis-01";
const head = "a0c1d4ae585e4765b5e6a8ff9196d22924d4dccc";

function input(overrides: Partial<ExternalWriteLeaseInput> = {}): ExternalWriteLeaseInput {
  return {
    repository_full_name: repository,
    pr_number: 2,
    branch,
    active_branch: branch,
    observed_head_sha: head,
    live_head_sha: head,
    write_surface: "github_contents_create_file",
    write_class: "external_write_lease_guard",
    spent_write_classes: [],
    planned_files: ["platform/packages/route-governor/src/external-write-lease.ts"],
    executable_artifacts: ["compileExternalWriteLease"],
    routing_artifacts: ["pre-write live-head lease boundary"],
    proof_artifacts: ["platform/packages/route-governor/src/external-write-lease-proof.ts"],
    ...overrides,
  };
}

const accepted = compileExternalWriteLease(input());
assert.equal(accepted.ok, true);
assert.equal(accepted.action, "accept_write_lease");
assert.equal(accepted.lease_id, `${repository}|pr-2|${branch}|${head}|external_write_lease_guard`);
assert.match(accepted.next_route, /new-head status cursor/);

const stale = compileExternalWriteLease(input({ observed_head_sha: "df3a4035d6841ae19cc32443f0d4ef11449e65ac" }));
assert.equal(stale.ok, false);
assert.equal(stale.action, "block_stale_observed_head");

const repeated = compileExternalWriteLease(input({ spent_write_classes: ["external_write_lease_guard"] }));
assert.equal(repeated.ok, false);
assert.equal(repeated.action, "block_repeated_write_class");

const missingSurface = compileExternalWriteLease(input({ write_surface: undefined }));
assert.equal(missingSurface.ok, false);
assert.equal(missingSurface.action, "block_missing_write_surface");

console.log("external write lease proof passed");
