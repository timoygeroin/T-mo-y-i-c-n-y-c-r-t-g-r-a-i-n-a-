import { enforceStatusEvidenceSufficiency, selectStatusEvidenceSufficientProgress } from "./status-evidence-sufficiency.js";

const liveHead = "8f618b7b1eb0eebcd90877be6f379fe2ee646d52";
const previousStatusHead = "a238cc9567cca63ddb22701ffcd3cb3f17732d5b";

const metadataOnly = enforceStatusEvidenceSufficiency({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  previous_status_head_sha: previousStatusHead,
  candidate: {
    candidate_id: "moved-head-metadata-only",
    progress_class: "fresh_status_readback",
    branch: "monday-platform-genesis-01",
    base_head_sha: liveHead,
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    status_surfaces: [],
  },
});

if (metadataOnly.ok || metadataOnly.action !== "block_metadata_only_status_readback") {
  throw new Error("moved-head metadata was allowed to masquerade as fresh status readback");
}

const selected = selectStatusEvidenceSufficientProgress(
  {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    previous_status_head_sha: previousStatusHead,
  },
  [
    {
      candidate_id: "metadata-only",
      progress_class: "fresh_status_readback",
      branch: "monday-platform-genesis-01",
      base_head_sha: liveHead,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      status_surfaces: [],
    },
    {
      candidate_id: "status-evidence-sufficiency-gate",
      progress_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/status-evidence-sufficiency.ts"],
      executable_artifacts: ["enforceStatusEvidenceSufficiency"],
      routing_artifacts: ["status evidence sufficiency gate"],
      status_surfaces: [],
    },
  ],
);

if (!selected.ok || selected.selected?.candidate_id !== "status-evidence-sufficiency-gate") {
  throw new Error("status evidence sufficiency proof failed to select embodiment after metadata-only readback was blocked");
}
