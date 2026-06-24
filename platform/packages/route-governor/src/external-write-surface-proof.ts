import assert from "node:assert/strict";

import { compileExternalWriteLease, type ExternalWriteLeaseInput } from "./external-write-lease.js";
import { routeExternalWriteSurface, type ExternalWriteSurfaceInput } from "./external-write-surface.js";

const liveHead = "5912fbaedc5e2a0b4d668c1404ce937c7b3a16e5";

function input(overrides: Partial<ExternalWriteSurfaceInput> = {}): ExternalWriteSurfaceInput {
  return {
    branch: "monday-platform-genesis-01",
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    available_surfaces: ["pr_metadata", "github_contents_create_file", "github_contents_update_file"],
    changed_files: [
      "platform/packages/route-governor/src/external-write-surface.ts",
      "platform/packages/route-governor/src/external-write-surface-proof.ts",
    ],
    executable_artifacts: ["routeExternalWriteSurface"],
    routing_artifacts: ["contents API embodiment route when local checkout or gh CLI are absent"],
    attempted_blocker: undefined,
    prohibited_blockers: [
      "old repaired-head status-readback blocker",
      "no writable external branch surface is available",
    ],
    ...overrides,
  };
}

function leaseInput(overrides: Partial<ExternalWriteLeaseInput> = {}): ExternalWriteLeaseInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    active_branch: "monday-platform-genesis-01",
    observed_head_sha: liveHead,
    live_head_sha: liveHead,
    write_surface: "github_contents_update_file",
    write_class: "external_write_lease_route_export",
    spent_write_classes: [],
    planned_files: [
      "platform/packages/route-governor/src/index.ts",
      "platform/packages/route-governor/src/external-write-surface-proof.ts",
    ],
    executable_artifacts: ["compileExternalWriteLease"],
    routing_artifacts: ["write lease binds the next status readback to the moved branch head"],
    proof_artifacts: ["platform/packages/route-governor/src/external-write-surface-proof.ts"],
    resulting_head_sha: "post-write-head",
    next_status_expected_head: "post-write-head",
    ...overrides,
  };
}

const embodiment = routeExternalWriteSurface(input());
assert.equal(embodiment.ok, true);
assert.equal(embodiment.action, "commit_via_external_write_surface");
assert.ok(embodiment.decisive_evidence.includes("write surface github_contents_create_file"));
assert.ok(embodiment.next_route.includes("moved PR head"));

const falseBlocker = routeExternalWriteSurface(input({ attempted_blocker: "no writable external branch surface is available" }));
assert.equal(falseBlocker.ok, false);
assert.equal(falseBlocker.action, "block_false_external_blocker");
assert.ok(falseBlocker.blockers[0].includes("while a write surface exists"));

const realBlocker = routeExternalWriteSurface(
  input({
    available_surfaces: ["pr_metadata", "commit_diff", "public_rest_status"],
    attempted_blocker: "no GitHub contents, branch-ref, or git-push write surface is available",
  }),
);
assert.equal(realBlocker.ok, false);
assert.equal(realBlocker.action, "emit_exact_external_blocker");
assert.deepEqual(realBlocker.blockers, ["no GitHub contents, branch-ref, or git-push write surface is available"]);

const lease = compileExternalWriteLease(leaseInput());
assert.equal(lease.ok, true);
assert.equal(lease.action, "accept_write_lease");
assert.equal(
  lease.lease_id,
  "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-|pr-2|monday-platform-genesis-01|5912fbaedc5e2a0b4d668c1404ce937c7b3a16e5|external_write_lease_route_export",
);
assert.equal(lease.next_status_expected_head, "post-write-head");
assert.ok(lease.decisive_evidence.includes("write surface github_contents_update_file"));

const staleLease = compileExternalWriteLease(
  leaseInput({ observed_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
);
assert.equal(staleLease.ok, false);
assert.equal(staleLease.action, "block_stale_observed_head");

const repeatedLease = compileExternalWriteLease(
  leaseInput({ spent_write_classes: ["external_write_lease_route_export"] }),
);
assert.equal(repeatedLease.ok, false);
assert.equal(repeatedLease.action, "block_repeated_write_class");

console.log("external-write-surface proof passed");
