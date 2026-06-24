import { admitProcessorEmbodimentBoundary } from "./processor-embodiment-boundary.js";

const branch = "monday-platform-genesis-01";
const liveHead = "post-resolution-live-head";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

const verdict = admitProcessorEmbodimentBoundary({
  active_branch: branch,
  live_head_sha: liveHead,
  repaired_head_sha: repairedHead,
  spent_boundary_ids: [],
  spent_progress_classes: ["metadata_reread", "duplicate_ci_summary", "reclose_resolved_blocker"],
  candidate: {
    boundary_id: "processor-boundary-proof",
    progress_class: "external_platform_embodiment",
    branch,
    base_head_sha: liveHead,
    changed_files: ["platform/packages/processor-fabric/src/processor-embodiment-boundary.ts"],
    behavior_exports: ["admitProcessorEmbodimentBoundary"],
    routing_artifacts: ["post-resolution processor-fabric boundary admission"],
    proof_artifacts: ["platform/packages/processor-fabric/src/processor-embodiment-boundary-proof.ts"],
    processor_dispatch_ids: ["loading-20:processor:external-act"],
    convergence_receipts: ["source-authorized-convergence:external-act"],
    resolved_boundary_ids: ["issue-1-ci-status-readback"],
  },
});

if (!verdict.ok) {
  throw new Error(`processor embodiment boundary proof failed: ${verdict.blockers.join("; ")}`);
}

if (verdict.action !== "admit_processor_embodiment_boundary") {
  throw new Error(`expected processor embodiment admission, got ${verdict.action}`);
}

if (!verdict.quarantined_head_shas.includes(repairedHead)) {
  throw new Error("repaired head was not quarantined after status boundary resolution");
}

console.log(JSON.stringify(verdict, null, 2));
