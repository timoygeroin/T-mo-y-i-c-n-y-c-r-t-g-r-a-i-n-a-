import assert from "node:assert/strict";
import test from "node:test";

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

test("accepts a live-head-bound executable branch write lease", () => {
  const verdict = compileExternalWriteLease(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "accept_write_lease");
  assert.equal(verdict.lease_id, `${repository}|pr-2|${branch}|${head}|external_write_lease_guard`);
  assert.match(verdict.next_route, /completion receipt/);
});

test("blocks stale observed heads before branch writes", () => {
  const verdict = compileExternalWriteLease(input({ observed_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_observed_head");
  assert.match(verdict.blockers[0], /but live head is/);
});

test("blocks missing external write surface", () => {
  const verdict = compileExternalWriteLease(input({ write_surface: undefined }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_write_surface");
});

test("blocks repeated write classes", () => {
  const verdict = compileExternalWriteLease(input({ spent_write_classes: ["external_write_lease_guard"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_repeated_write_class");
});

test("blocks write plans without executable route and proof evidence", () => {
  const verdict = compileExternalWriteLease(
    input({
      planned_files: ["platform/docs/manifestation-contract.md"],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_write_plan");
  assert.deepEqual(verdict.blockers, [
    "write lease has no executable platform file in planned files",
    "write lease has no executable artifact evidence",
    "write lease has no future-routing artifact evidence",
    "write lease has no proof artifact evidence",
  ]);
});

test("blocks branch mismatches", () => {
  const verdict = compileExternalWriteLease(input({ branch: "other-branch" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_branch_mismatch");
});
