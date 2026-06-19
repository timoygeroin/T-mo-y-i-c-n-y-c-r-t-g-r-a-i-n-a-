import { compileEvidenceFreshnessWindow } from "./evidence-freshness-window.js";

const liveHead = "73a7755768570fef79307171e0bc7468b90e921d";

const verdict = compileEvidenceFreshnessWindow({
  branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  live_head_observed_at: "2026-06-19T10:10:49Z",
  require_status_authority: true,
  claims: [
    {
      claim_id: "spent-repaired-head-prompt",
      source: "prompt_text",
      purpose: "status_authority",
      bound_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
      observed_at: "2026-06-19T10:12:00Z",
      evidence: ["seven repaired-head checks succeeded"],
    },
    {
      claim_id: "current-head-check-run",
      source: "github_check_run",
      purpose: "status_authority",
      bound_head_sha: liveHead,
      observed_at: "2026-06-19T10:12:00Z",
      evidence: ["current-head check run is bound to the live PR head"],
    },
  ],
});

if (!verdict.ok || verdict.action !== "accept_current_status_authority") {
  throw new Error(`expected current-head status authority, got ${verdict.action}: ${verdict.blockers.join("; ")}`);
}

if (!verdict.rejected_claim_ids.includes("spent-repaired-head-prompt")) {
  throw new Error("spent repaired-head prompt claim was not rejected");
}

if (!verdict.accepted_claim_ids.includes("current-head-check-run")) {
  throw new Error("current-head check run was not accepted");
}
