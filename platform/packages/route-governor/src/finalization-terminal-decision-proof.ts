import assert from "node:assert/strict";

import { compileFinalizationTerminalDecision } from "./finalization-terminal-decision.js";

const liveHead = "95d13f015619d6fa26a40b6b55d006b8ad34000c";

const verdict = compileFinalizationTerminalDecision({
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  last_status_readback_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
  repaired_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
  draft: false,
  mergeable: true,
  required_approval_count: 1,
  resolved_blocker_ids: ["issue-1-ci-status-readback"],
  prohibited_candidate_classes: [
    "duplicate_ci_summary",
    "duplicate_comment",
    "duplicate_label",
    "metadata_reread",
    "warning_maintenance",
    "reclose_resolved_blocker",
  ],
  status_surface: {
    surface_id: "live-head-status-95d13f0",
    head_sha: liveHead,
    verdict: "passing_with_warnings",
    decisive_successes: ["Route Governor Proof succeeded", "Monday Platform CI succeeded"],
    blockers: [],
    warnings: ["Node.js 20 Actions deprecation notice"],
  },
  candidates: [
    {
      candidate_id: "duplicate-status-summary",
      candidate_class: "duplicate_ci_summary",
      branch: "monday-platform-genesis-01",
      base_head_sha: liveHead,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
    },
    {
      candidate_id: "review-handoff",
      candidate_class: "review_handoff",
      branch: "monday-platform-genesis-01",
      base_head_sha: liveHead,
      changed_files: [],
      executable_artifacts: [],
      routing_artifacts: [],
      proof_artifacts: [],
      requested_reviewers: ["external-reviewer"],
    },
    {
      candidate_id: "terminal-embodiment",
      candidate_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/finalization-terminal-decision.ts"],
      executable_artifacts: ["compileFinalizationTerminalDecision"],
      routing_artifacts: ["terminal finalization decision compiler"],
      proof_artifacts: ["platform/packages/route-governor/src/finalization-terminal-decision-proof.ts"],
    },
  ],
});

assert.equal(verdict.ok, true);
assert.equal(verdict.action, "route_to_review_handoff");
assert.equal(verdict.selected_candidate_id, "review-handoff");
assert.match(verdict.rejected[0]?.reasons.join("; ") ?? "", /non-progress/);
assert.match(verdict.next_route, /final review/);

console.log("finalization terminal decision proof passed");
