import { enforceLiveEmbodimentCovenant, type LiveEmbodimentCovenantInput } from "./live-embodiment-covenant.js";

const liveHead = "6155b019f02f424cca677fa34fd342d5d94a167c";
const movedHead = "post-write-head-sha";

function baseInput(overrides: Partial<LiveEmbodimentCovenantInput> = {}): LiveEmbodimentCovenantInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    resolved_historical_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    spent_covenant_ids: [],
    package_exports: ["./live-embodiment-covenant"],
    index_exports: ['export * from "./live-embodiment-covenant.js";'],
    proof_command:
      "tsc -p tsconfig.json && node dist/proof-examples.js && node dist/live-embodiment-covenant-proof.js",
    candidate: {
      covenant_id: "live-embodiment-covenant-public-surface",
      move_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: liveHead,
      changed_files: [
        "platform/packages/route-governor/src/live-embodiment-covenant.ts",
        "platform/packages/route-governor/src/live-embodiment-covenant-proof.ts",
        "platform/packages/route-governor/src/index.ts",
        "platform/packages/route-governor/package.json",
      ],
      behavior_artifacts: ["enforceLiveEmbodimentCovenant"],
      routing_artifacts: ["live head base", "public export", "next status head binding"],
      proof_artifacts: ["runLiveEmbodimentCovenantProof"],
      package_export: "./live-embodiment-covenant",
      index_export: 'export * from "./live-embodiment-covenant.js";',
      proof_module: "dist/live-embodiment-covenant-proof.js",
      next_status_expected_head: movedHead,
    },
    ...overrides,
  };
}

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
}

function expectBlock(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) throw new Error(`${name} should block, but passed`);
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not block for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

export function runLiveEmbodimentCovenantProof(): void {
  const admitted = enforceLiveEmbodimentCovenant(baseInput());
  expectOk("live embodiment covenant", admitted.ok, admitted.blockers);
  if (admitted.action !== "admit_live_embodiment_covenant") {
    throw new Error(`unexpected action: ${admitted.action}`);
  }
  if (!admitted.decisive_evidence.includes(`next status head ${movedHead}`)) {
    throw new Error("admitted covenant did not bind next status to the moved head");
  }

  const staleRepairedHead = enforceLiveEmbodimentCovenant(
    baseInput({
      candidate: {
        ...baseInput().candidate,
        base_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      },
    }),
  );
  expectBlock("stale repaired head base", staleRepairedHead.ok, staleRepairedHead.blockers, "not live PR head");

  const duplicateStatus = enforceLiveEmbodimentCovenant(
    baseInput({ candidate: { ...baseInput().candidate, move_class: "duplicate_ci_summary" } }),
  );
  expectBlock("duplicate status substitute", duplicateStatus.ok, duplicateStatus.blockers, "duplicate_ci_summary");

  const proofOnly = enforceLiveEmbodimentCovenant(
    baseInput({
      candidate: {
        ...baseInput().candidate,
        changed_files: [
          "platform/packages/route-governor/src/live-embodiment-covenant-proof.ts",
          "platform/packages/route-governor/src/index.ts",
          "platform/packages/route-governor/package.json",
        ],
      },
    }),
  );
  expectBlock("proof-only covenant", proofOnly.ok, proofOnly.blockers, "behavior-bearing");

  const missingPublicSurface = enforceLiveEmbodimentCovenant(
    baseInput({
      package_exports: [],
      index_exports: [],
      proof_command: "tsc -p tsconfig.json",
    }),
  );
  expectBlock("missing public surface", missingPublicSurface.ok, missingPublicSurface.blockers, "missing package export");

  const sameHeadNextStatus = enforceLiveEmbodimentCovenant(
    baseInput({ candidate: { ...baseInput().candidate, next_status_expected_head: liveHead } }),
  );
  expectBlock("same-head next status", sameHeadNextStatus.ok, sameHeadNextStatus.blockers, "moved post-write head");
}

runLiveEmbodimentCovenantProof();
