import { compileFinalizationSurfacePromotion, type FinalizationSurfacePromotionInput } from "./finalization-surface-promotion.js";

const activeBranch = "monday-platform-genesis-01";

function baseInput(overrides: Partial<FinalizationSurfacePromotionInput> = {}): FinalizationSurfacePromotionInput {
  return {
    branch: activeBranch,
    active_branch: activeBranch,
    changed_files: [
      "platform/packages/route-governor/package.json",
      "platform/packages/route-governor/src/finalization-surface-promotion-proof.ts",
    ],
    package_exports: ["./merge-finalization-command", "./merge-result-receipt"],
    index_exports: ["compileMergeFinalizationCommand", "compileMergeResultReceipt"],
    proof_command:
      "tsc -p tsconfig.json && node dist/merge-finalization-command-proof.js && node dist/merge-result-receipt-proof.js && node dist/finalization-surface-promotion-proof.js",
    candidates: [
      {
        surface_id: "merge-finalization-command-public-surface",
        boundary: "merge_command",
        package_subpath: "./merge-finalization-command",
        index_export: "compileMergeFinalizationCommand",
        source_path: "platform/packages/route-governor/src/merge-finalization-command.ts",
        proof_module: "dist/merge-finalization-command-proof.js",
        route_gain: "downstream callers can compile guarded merge commands without importing private package internals",
      },
      {
        surface_id: "merge-result-receipt-public-surface",
        boundary: "merge_result_receipt",
        package_subpath: "./merge-result-receipt",
        index_export: "compileMergeResultReceipt",
        source_path: "platform/packages/route-governor/src/merge-result-receipt.ts",
        proof_module: "dist/merge-result-receipt-proof.js",
        route_gain: "downstream callers can bind GitHub merge API results to live-head receipts",
      },
    ],
    spent_surface_ids: [],
    ...overrides,
  };
}

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) {
    throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
  }
}

function expectBlock(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) {
    throw new Error(`${name} should block, but passed`);
  }
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not block for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

export function runFinalizationSurfacePromotionProof(): void {
  const admitted = compileFinalizationSurfacePromotion(baseInput());
  expectOk("complete public finalization surface promotion", admitted.ok, admitted.blockers);
  if (admitted.promoted_surface_ids.length !== 2) {
    throw new Error(`expected two promoted surfaces, got ${admitted.promoted_surface_ids.length}`);
  }

  const missingPackageExport = compileFinalizationSurfacePromotion(
    baseInput({ package_exports: ["./merge-result-receipt"] }),
  );
  expectBlock(
    "missing package export",
    missingPackageExport.ok,
    missingPackageExport.blockers,
    "missing package export",
  );

  const missingProofExecution = compileFinalizationSurfacePromotion(
    baseInput({ proof_command: "tsc -p tsconfig.json && node dist/merge-result-receipt-proof.js" }),
  );
  expectBlock(
    "missing proof execution",
    missingProofExecution.ok,
    missingProofExecution.blockers,
    "proof is not executed",
  );

  const replayedSurface = compileFinalizationSurfacePromotion(
    baseInput({ spent_surface_ids: ["merge-finalization-command-public-surface"] }),
  );
  expectBlock("replayed surface promotion", replayedSurface.ok, replayedSurface.blockers, "already promoted");

  const wrongBranch = compileFinalizationSurfacePromotion(baseInput({ branch: "main" }));
  expectBlock("wrong branch promotion", wrongBranch.ok, wrongBranch.blockers, "does not match active branch");
}

runFinalizationSurfacePromotionProof();
