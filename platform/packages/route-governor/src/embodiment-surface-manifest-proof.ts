import { compileEmbodimentSurfaceManifest, type EmbodimentSurfaceManifestInput } from "./embodiment-surface-manifest.js";

const liveHead = "29d390093ec73fc353831b82f3e341ea9946228d";
const resultingHead = "post-write-manifest-head";

function baseInput(overrides: Partial<EmbodimentSurfaceManifestInput> = {}): EmbodimentSurfaceManifestInput {
  return {
    manifest_id: "embodiment-surface-manifest-001",
    spent_manifest_ids: [],
    active_branch: "monday-platform-genesis-01",
    branch: "monday-platform-genesis-01",
    base_head_sha: liveHead,
    live_head_sha: liveHead,
    resulting_head_sha: resultingHead,
    next_status_expected_head: resultingHead,
    behavior_surfaces: [
      {
        path: "platform/packages/route-governor/src/embodiment-surface-manifest.ts",
        export_name: "compileEmbodimentSurfaceManifest",
        proof_artifact: "platform/packages/route-governor/src/embodiment-surface-manifest-proof.ts",
      },
    ],
    root_index_exports: ['export * from "./embodiment-surface-manifest.js";'],
    proof_artifacts: ["platform/packages/route-governor/src/embodiment-surface-manifest-proof.ts"],
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

export function runEmbodimentSurfaceManifestProof(): void {
  const accepted = compileEmbodimentSurfaceManifest(baseInput());
  expectOk("surface manifest", accepted.ok, accepted.blockers);
  if (accepted.action !== "accept_embodiment_surface_manifest") {
    throw new Error(`unexpected action: ${accepted.action}`);
  }
  if (!accepted.decisive_evidence.includes(`next status ${resultingHead}`)) {
    throw new Error("surface manifest did not bind next status to the resulting head");
  }

  const hidden = compileEmbodimentSurfaceManifest(baseInput({ root_index_exports: [] }));
  expectBlock("hidden behavior surface", hidden.ok, hidden.blockers, "missing root index export");

  const proofOnly = compileEmbodimentSurfaceManifest(
    baseInput({
      behavior_surfaces: [
        {
          path: "platform/packages/route-governor/src/embodiment-surface-manifest-proof.ts",
          export_name: "runEmbodimentSurfaceManifestProof",
          proof_artifact: "platform/packages/route-governor/src/embodiment-surface-manifest-proof.ts",
        },
      ],
    }),
  );
  expectBlock("proof-only surface", proofOnly.ok, proofOnly.blockers, "not behavior-bearing");

  const staleBase = compileEmbodimentSurfaceManifest(
    baseInput({ base_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
  );
  expectBlock("stale base", staleBase.ok, staleBase.blockers, "not live head");

  const missingStatusCursor = compileEmbodimentSurfaceManifest(
    baseInput({ next_status_expected_head: liveHead }),
  );
  expectBlock("missing next status cursor", missingStatusCursor.ok, missingStatusCursor.blockers, "resulting post-write head");
}

runEmbodimentSurfaceManifestProof();
