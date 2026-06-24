import assert from "node:assert/strict";
import test from "node:test";

import { compilePostResolutionModuleWriteReceipt } from "./post-resolution-module-write-receipt.js";
import type { PostResolutionPlatformModuleSelectorVerdict } from "./post-resolution-platform-module-selector.js";

const baseHead = "a416ff8295668850bbf179bd9ddfa7a207aa284f";
const nextHead = "next-post-resolution-module-write-head";

function selectedSelector(
  overrides: Partial<PostResolutionPlatformModuleSelectorVerdict> = {},
): PostResolutionPlatformModuleSelectorVerdict {
  return {
    ok: true,
    action: "select_platform_module_embodiment",
    branch: "monday-platform-genesis-01",
    head_sha: baseHead,
    selected: {
      candidate_id: "route-governor-write-receipt",
      module_id: "route_governor",
      progress_class: "external_platform_embodiment",
      decisive_evidence: ["module:route_governor"],
    },
    rejected: [],
    quarantined_head_shas: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    blockers: [],
    next_route: "create or extend the route_governor platform package boundary on the live PR head",
    ...overrides,
  };
}

test("compiles a moved-head route-governor write receipt", () => {
  const receipt = compilePostResolutionModuleWriteReceipt({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: baseHead,
    resulting_head_sha: nextHead,
    write_id: "post-resolution-module-write-receipt-001",
    spent_write_ids: [],
    selector: selectedSelector(),
    changed_files: ["platform/packages/route-governor/src/post-resolution-module-write-receipt.ts"],
    behavior_exports: ["compilePostResolutionModuleWriteReceipt"],
    package_boundary_files: [],
    proof_artifacts: ["platform/packages/route-governor/src/post-resolution-module-write-receipt-proof.ts"],
  });

  assert.equal(receipt.ok, true);
  assert.equal(receipt.action, "compile_post_resolution_module_write_receipt");
  assert.equal(receipt.required_status_head_sha, nextHead);
});

test("rejects selection-only receipts that do not move the PR head", () => {
  const receipt = compilePostResolutionModuleWriteReceipt({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: baseHead,
    resulting_head_sha: baseHead,
    write_id: "selection-only",
    spent_write_ids: [],
    selector: selectedSelector(),
    changed_files: ["platform/packages/route-governor/src/post-resolution-module-write-receipt.ts"],
    behavior_exports: ["compilePostResolutionModuleWriteReceipt"],
    package_boundary_files: [],
    proof_artifacts: ["platform/packages/route-governor/src/post-resolution-module-write-receipt-proof.ts"],
  });

  assert.equal(receipt.ok, false);
  assert.equal(receipt.action, "block_unmoved_write_head");
});

test("rejects proof-only writes", () => {
  const receipt = compilePostResolutionModuleWriteReceipt({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: baseHead,
    resulting_head_sha: nextHead,
    write_id: "proof-only",
    spent_write_ids: [],
    selector: selectedSelector(),
    changed_files: ["platform/packages/route-governor/src/post-resolution-module-write-receipt-proof.ts"],
    behavior_exports: ["compilePostResolutionModuleWriteReceipt"],
    package_boundary_files: [],
    proof_artifacts: ["platform/packages/route-governor/src/post-resolution-module-write-receipt-proof.ts"],
  });

  assert.equal(receipt.ok, false);
  assert.equal(receipt.action, "block_proof_only_write");
});

test("requires package boundary files for a new non-governor module", () => {
  const receipt = compilePostResolutionModuleWriteReceipt({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: baseHead,
    resulting_head_sha: nextHead,
    write_id: "processor-write-missing-boundary",
    spent_write_ids: [],
    selector: selectedSelector({
      selected: {
        candidate_id: "processor-fabric-candidate",
        module_id: "processor_fabric",
        progress_class: "external_platform_embodiment",
        decisive_evidence: ["module:processor_fabric"],
      },
    }),
    changed_files: ["platform/packages/processor-fabric/src/index.ts"],
    behavior_exports: ["compileProcessorFabric"],
    package_boundary_files: [],
    proof_artifacts: ["platform/packages/processor-fabric/src/processor-fabric-proof.ts"],
  });

  assert.equal(receipt.ok, false);
  assert.equal(receipt.action, "block_missing_module_boundary");
  assert.ok(receipt.blockers.some((blocker) => blocker.includes("package.json")));
});

test("turns selected exact blockers into blocker receipts", () => {
  const receipt = compilePostResolutionModuleWriteReceipt({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: baseHead,
    resulting_head_sha: baseHead,
    write_id: "exact-blocker-receipt",
    spent_write_ids: [],
    selector: selectedSelector({
      action: "select_exact_external_blocker",
      selected: {
        candidate_id: "external-branch-write-blocker",
        module_id: null,
        progress_class: "exact_external_blocker",
        decisive_evidence: ["GitHub contents write unavailable"],
      },
      blockers: ["GitHub contents write unavailable"],
      next_route: "remove the exact external blocker before selecting another platform module",
    }),
    changed_files: [],
    behavior_exports: [],
    package_boundary_files: [],
    proof_artifacts: [],
  });

  assert.equal(receipt.ok, true);
  assert.equal(receipt.action, "compile_post_resolution_exact_blocker_receipt");
  assert.deepEqual(receipt.blockers, ["GitHub contents write unavailable"]);
});
