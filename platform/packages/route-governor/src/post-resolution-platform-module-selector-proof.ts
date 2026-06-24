import { selectPostResolutionPlatformModule } from "./post-resolution-platform-module-selector.js";

const branch = "monday-platform-genesis-01";
const liveHead = "51f95187a3085994ffa82357e851761737270702";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

const verdict = selectPostResolutionPlatformModule({
  active_branch: branch,
  live_head_sha: liveHead,
  repaired_head_sha: repairedHead,
  resolved_boundary_ids: ["issue-1-ci-status-readback"],
  existing_package_boundaries: ["route_governor"],
  prohibited_progress_classes: ["metadata_reread", "duplicate_ci_summary", "reclose_resolved_blocker"],
  spent_candidate_ids: [],
  candidates: [
    {
      candidate_id: "duplicate-status-summary",
      module_id: "route_governor",
      progress_class: "duplicate_ci_summary",
      branch,
      base_head_sha: liveHead,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
      produces_new_package_boundary: false,
    },
    {
      candidate_id: "processor-fabric-boundary",
      module_id: "processor_fabric",
      progress_class: "external_platform_embodiment",
      branch,
      base_head_sha: liveHead,
      changed_files: ["platform/packages/processor-fabric/src/index.ts"],
      executable_artifacts: ["createProcessorFabricWorkQueue"],
      routing_artifacts: ["post-resolution platform module selector"],
      proof_artifacts: ["platform/packages/route-governor/src/post-resolution-platform-module-selector-proof.ts"],
      produces_new_package_boundary: true,
    },
  ],
});

if (!verdict.ok) {
  throw new Error(`post-resolution platform module selector proof failed: ${verdict.blockers.join("; ")}`);
}

if (verdict.action !== "select_platform_module_embodiment") {
  throw new Error(`expected platform module embodiment, got ${verdict.action}`);
}

if (verdict.selected?.module_id !== "processor_fabric") {
  throw new Error(`expected processor_fabric, got ${verdict.selected?.module_id ?? "none"}`);
}

if (!verdict.quarantined_head_shas.includes(repairedHead)) {
  throw new Error("repaired head was not quarantined as historical after resolution");
}

console.log(JSON.stringify(verdict, null, 2));
