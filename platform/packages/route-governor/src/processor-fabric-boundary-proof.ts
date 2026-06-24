import { admitProcessorFabricBoundary } from "./processor-fabric-boundary.js";

export function runProcessorFabricBoundaryProof(): void {
  const verdict = admitProcessorFabricBoundary({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: "live-head",
    spent_candidate_ids: [],
    existing_package_boundaries: [],
    candidate: {
      candidate_id: "processor-fabric-boundary-proof",
      branch: "monday-platform-genesis-01",
      base_head_sha: "live-head",
      package_boundary: "platform/packages/processor-fabric",
      changed_files: [
        "platform/packages/processor-fabric/package.json",
        "platform/packages/processor-fabric/src/index.ts",
        "platform/packages/route-governor/src/processor-fabric-boundary.ts",
      ],
      executable_artifacts: ["compileProcessorFabric"],
      routing_artifacts: ["processor fabric package boundary"],
      proof_artifacts: ["runProcessorFabricProof"],
    },
  });

  if (!verdict.ok || verdict.action !== "admit_processor_fabric_boundary") {
    throw new Error(`processor fabric boundary proof failed: ${verdict.blockers.join("; ")}`);
  }
}

runProcessorFabricBoundaryProof();
