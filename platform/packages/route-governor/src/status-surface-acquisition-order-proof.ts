import { orderStatusSurfaceAcquisition } from "./status-surface-acquisition-order.js";

const liveHead = "f3a8ace7b0236e1c2a59f672f4b98ff104c56212";

const metadataOnlyVerdict = orderStatusSurfaceAcquisition({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  observations: [
    {
      surface_id: "live-pr-metadata",
      kind: "live_pr_metadata",
      branch: "monday-platform-genesis-01",
      head_sha: liveHead,
      evidence: [`PR metadata reports live head ${liveHead}`],
    },
  ],
});

if (metadataOnlyVerdict.ok || metadataOnlyVerdict.action !== "block_metadata_only_status_claim") {
  throw new Error("metadata-only PR readback must not be accepted as a status surface");
}

const checkRunVerdict = orderStatusSurfaceAcquisition({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  observations: [
    {
      surface_id: "route-governor-proof-check",
      kind: "check_run",
      branch: "monday-platform-genesis-01",
      head_sha: liveHead,
      verdict: "passing_with_warnings",
      evidence: ["Route governor proof examples completed", "Node.js 20 deprecation warning remains non-blocking"],
    },
  ],
});

if (!checkRunVerdict.ok || checkRunVerdict.status_claim !== "bound_to_live_head") {
  throw new Error("live-head check run must be accepted as the status surface");
}

console.log(
  JSON.stringify(
    {
      proof: "status-surface-acquisition-order",
      metadata_only_action: metadataOnlyVerdict.action,
      accepted_status_action: checkRunVerdict.action,
      acquisition_order: metadataOnlyVerdict.acquisition_order,
    },
    null,
    2,
  ),
);
