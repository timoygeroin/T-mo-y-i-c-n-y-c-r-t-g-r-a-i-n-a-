import { compileScheduledFinalizationIngress } from "./scheduled-finalization-ingress.js";

const verdict = compileScheduledFinalizationIngress({
  active_branch: "monday-platform-genesis-01",
  instruction_branch: "monday-platform-genesis-01",
  instruction_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
  live_pr: {
    branch: "monday-platform-genesis-01",
    head_sha: "06790fc3f0eb5fd05d614ae711d6567ac352d831",
    state: "open",
    draft: false,
    mergeable: true,
  },
  latest_receipt: {
    receipt_id: "embodiment-increment-planner",
    branch: "monday-platform-genesis-01",
    head_sha: "06790fc3f0eb5fd05d614ae711d6567ac352d831",
    progress_class: "external_platform_embodiment",
  },
  resolved_repaired_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
  prohibited_progress_classes: ["metadata_reread", "duplicate_ci_summary", "old_repaired_head_blocker"],
});

if (!verdict.ok) {
  throw new Error(`scheduled finalization ingress proof failed: ${verdict.blockers.join("; ")}`);
}

if (verdict.quarantined_instruction_head_sha !== "b38ea247602ae8ebba80c4120ad03b41b26bd841") {
  throw new Error("scheduled finalization ingress proof did not quarantine the resolved repaired head");
}
