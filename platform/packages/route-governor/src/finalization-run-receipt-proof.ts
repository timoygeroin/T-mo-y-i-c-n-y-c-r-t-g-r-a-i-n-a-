import { compileFinalizationRunReceipt } from "./finalization-run-receipt.js";

const liveHead = "13aa1491804b2b40734c7b71a3efaaac2b9c5f55";

const verdict = compileFinalizationRunReceipt({
  run_id: "scheduled-finalization-run-13aa",
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  instruction_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
  resolved_historical_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
  source_tiers: ["direct_current_instruction", "live_pr_metadata", "memory_receipt"],
  prohibited_move_classes: ["pr_metadata_reread", "duplicate_ci_summary", "local_memory_guard"],
  spent_artifact_classes: ["post-status-embodiment-queue", "status-readback-authority-lease"],
  progress: {
    move_class: "external_platform_embodiment",
    artifact_class: "finalization-run-receipt",
    branch: "monday-platform-genesis-01",
    base_head_sha: liveHead,
    resulting_head_sha: "next-head-after-finalization-run-receipt",
    next_status_expected_head_sha: "next-head-after-finalization-run-receipt",
    changed_files: ["platform/packages/route-governor/src/finalization-run-receipt.ts"],
    executable_artifacts: ["compileFinalizationRunReceipt"],
    routing_artifacts: ["finalization run receipt compiler"],
    proof_artifacts: ["platform/packages/route-governor/src/finalization-run-receipt-proof.ts"],
    status_surface_ids: [],
  },
});

if (!verdict.ok || verdict.action !== "accept_external_embodiment_run") {
  throw new Error(`finalization run receipt proof failed: ${verdict.blockers.join("; ")}`);
}

if (verdict.quarantined_instruction_head_sha !== "b38ea247602ae8ebba80c4120ad03b41b26bd841") {
  throw new Error("finalization run receipt did not preserve the repaired instruction head as historical");
}
