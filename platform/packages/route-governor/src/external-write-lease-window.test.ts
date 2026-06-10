import assert from "node:assert/strict";
import test from "node:test";

import { compileExternalWriteLeaseWindow, type ExternalWriteLeaseWindowInput } from "./external-write-lease-window.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const branch = "monday-platform-genesis-01";
const head = "358e23646a5e4dd3ffae7d773cd83a25515fcc66";

function input(overrides: Partial<ExternalWriteLeaseWindowInput> = {}): ExternalWriteLeaseWindowInput {
  return {
    repository_full_name: repository,
    pr_number: 2,
    branch,
    active_branch: branch,
    lease_id: `${repository}|pr-2|${branch}|${head}|lease-window`,
    leased_head_sha: head,
    live_head_sha: head,
    issued_at_epoch_ms: 1000,
    now_epoch_ms: 1200,
    ttl_ms: 5000,
    execution_started: false,
    planned_files: ["platform/packages/route-governor/src/external-write-lease-window.ts"],
    executable_artifacts: ["compileExternalWriteLeaseWindow"],
    routing_artifacts: ["bounded live-head write lease window"],
    proof_artifacts: ["platform/packages/route-governor/src/external-write-lease-window-proof.ts"],
    ...overrides,
  };
}

test("opens a bounded live-head write window before execution", () => {
  const verdict = compileExternalWriteLeaseWindow(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "open_write_window");
  assert.equal(verdict.expires_at_epoch_ms, 6000);
  assert.match(verdict.next_route, /before the lease window expires/);
});

test("executes only while the lease is still bound to the live head", () => {
  const verdict = compileExternalWriteLeaseWindow(input({ execution_started: true }));

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "execute_within_window");
  assert.match(verdict.next_route, /reject the result if the PR head changes/);
});

test("blocks a lease issued for an older head", () => {
  const verdict = compileExternalWriteLeaseWindow(
    input({ leased_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_lease_head");
  assert.match(verdict.blockers[0], /but live head is/);
});

test("blocks expired write windows", () => {
  const verdict = compileExternalWriteLeaseWindow(input({ now_epoch_ms: 7001 }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_expired_lease");
});

test("blocks incomplete lease windows", () => {
  const verdict = compileExternalWriteLeaseWindow(
    input({
      ttl_ms: 0,
      planned_files: ["platform/docs/manifestation-contract.md"],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unopened_window");
  assert.deepEqual(verdict.blockers, [
    "write lease window has no positive ttl",
    "write lease window has no executable platform file",
    "write lease window has no executable artifact evidence",
    "write lease window has no routing artifact evidence",
    "write lease window has no proof artifact evidence",
  ]);
});

test("blocks branch mismatches", () => {
  const verdict = compileExternalWriteLeaseWindow(input({ branch: "main" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_branch_mismatch");
});
