import assert from "node:assert/strict";

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

const opened = compileExternalWriteLeaseWindow(input());
assert.equal(opened.ok, true);
assert.equal(opened.action, "open_write_window");

const executing = compileExternalWriteLeaseWindow(input({ execution_started: true }));
assert.equal(executing.ok, true);
assert.equal(executing.action, "execute_within_window");

const stale = compileExternalWriteLeaseWindow(input({ leased_head_sha: "df3a4035d6841ae19cc32443f0d4ef11449e65ac" }));
assert.equal(stale.ok, false);
assert.equal(stale.action, "block_stale_lease_head");

const expired = compileExternalWriteLeaseWindow(input({ now_epoch_ms: 7001 }));
assert.equal(expired.ok, false);
assert.equal(expired.action, "block_expired_lease");

console.log("external write lease window proof passed");
