import { convergeTriSurfaceRoute } from "./tri-surface-convergence.js";

const activeBranch = "monday-platform-genesis-01";
const liveHead = "373a30f68eec5187c6c76751431c06552d31440d";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

const verdict = convergeTriSurfaceRoute({
  active_branch: activeBranch,
  live_head_sha: liveHead,
  last_resolved_head_sha: repairedHead,
  observations: [
    {
      surface_id: "scheduled-prompt-repaired-head",
      kind: "scheduled_prompt",
      branch: activeBranch,
      head_sha: repairedHead,
      status_verdict: "passing_with_warnings",
      evidence: ["repaired-head checks succeeded and the old blocker is resolved"],
    },
    {
      surface_id: "pr-body-prior-moved-head-failure",
      kind: "pr_body_summary",
      branch: activeBranch,
      head_sha: "df3a4035d6841ae19cc32443f0d4ef11449e65ac",
      status_verdict: "failing",
      evidence: ["PR body carries an older moved-head failure summary"],
    },
    {
      surface_id: "live-pr-metadata",
      kind: "live_pr_metadata",
      branch: activeBranch,
      head_sha: liveHead,
      status_verdict: "unknown",
      evidence: [`live PR metadata reports ${liveHead}`],
    },
  ],
});

if (!verdict.ok || verdict.action !== "converge_on_live_head") {
  throw new Error(`tri-surface convergence did not bind to live head: ${verdict.blockers.join("; ")}`);
}

if (!verdict.historical_surface_ids.includes("scheduled-prompt-repaired-head")) {
  throw new Error("tri-surface convergence failed to preserve repaired-head success as historical context");
}

if (!verdict.quarantined_surface_ids.includes("pr-body-prior-moved-head-failure")) {
  throw new Error("tri-surface convergence failed to quarantine stale PR-body failure summary");
}
