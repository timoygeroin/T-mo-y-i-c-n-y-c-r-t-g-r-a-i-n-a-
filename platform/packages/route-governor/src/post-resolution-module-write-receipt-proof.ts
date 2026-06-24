import assert from "node:assert/strict";

import { compilePostResolutionModuleWriteReceipt } from "./post-resolution-module-write-receipt.js";
import type { PostResolutionPlatformModuleSelectorVerdict } from "./post-resolution-platform-module-selector.js";

const baseHead = "a416ff8295668850bbf179bd9ddfa7a207aa284f";
const resultingHead = "post-resolution-module-write-result-head";

const selector: PostResolutionPlatformModuleSelectorVerdict = {
  ok: true,
  action: "select_platform_module_embodiment",
  branch: "monday-platform-genesis-01",
  head_sha: baseHead,
  selected: {
    candidate_id: "post-resolution-module-write-receipt",
    module_id: "route_governor",
    progress_class: "external_platform_embodiment",
    decisive_evidence: [
      "module:route_governor",
      "platform/packages/route-governor/src/post-resolution-module-write-receipt.ts",
    ],
  },
  rejected: [],
  quarantined_head_shas: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
  blockers: [],
  next_route: "create or extend the route_governor platform package boundary on the live PR head",
};

const receipt = compilePostResolutionModuleWriteReceipt({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: baseHead,
  resulting_head_sha: resultingHead,
  write_id: "post-resolution-module-write-receipt-001",
  spent_write_ids: [],
  selector,
  changed_files: ["platform/packages/route-governor/src/post-resolution-module-write-receipt.ts"],
  behavior_exports: ["compilePostResolutionModuleWriteReceipt"],
  package_boundary_files: [],
  proof_artifacts: ["platform/packages/route-governor/src/post-resolution-module-write-receipt-proof.ts"],
});

assert.equal(receipt.ok, true);
assert.equal(receipt.action, "compile_post_resolution_module_write_receipt");
assert.equal(receipt.branch, "monday-platform-genesis-01");
assert.equal(receipt.base_head_sha, baseHead);
assert.equal(receipt.resulting_head_sha, resultingHead);
assert.equal(receipt.required_status_head_sha, resultingHead);
assert.ok(receipt.decisive_evidence.includes("compilePostResolutionModuleWriteReceipt"));

const staleSelector = compilePostResolutionModuleWriteReceipt({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: baseHead,
  resulting_head_sha: resultingHead,
  write_id: "stale-selector",
  spent_write_ids: [],
  selector: { ...selector, head_sha: "stale-head" },
  changed_files: ["platform/packages/route-governor/src/post-resolution-module-write-receipt.ts"],
  behavior_exports: ["compilePostResolutionModuleWriteReceipt"],
  package_boundary_files: [],
  proof_artifacts: ["platform/packages/route-governor/src/post-resolution-module-write-receipt-proof.ts"],
});

assert.equal(staleSelector.ok, false);
assert.equal(staleSelector.action, "block_stale_write_base");

const proofOnly = compilePostResolutionModuleWriteReceipt({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: baseHead,
  resulting_head_sha: resultingHead,
  write_id: "proof-only",
  spent_write_ids: [],
  selector,
  changed_files: ["platform/packages/route-governor/src/post-resolution-module-write-receipt-proof.ts"],
  behavior_exports: ["compilePostResolutionModuleWriteReceipt"],
  package_boundary_files: [],
  proof_artifacts: ["platform/packages/route-governor/src/post-resolution-module-write-receipt-proof.ts"],
});

assert.equal(proofOnly.ok, false);
assert.equal(proofOnly.action, "block_proof_only_write");
