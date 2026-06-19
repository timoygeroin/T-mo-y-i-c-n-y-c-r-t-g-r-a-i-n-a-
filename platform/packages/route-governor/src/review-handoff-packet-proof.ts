import assert from "node:assert/strict";

import { compileReviewHandoffPacket } from "./review-handoff-packet.js";
import type { TerminalReviewHandoffVerdict } from "./terminal-review-handoff.js";

export function runReviewHandoffPacketProof(): void {
  const head = "4b7910bd3566c35ee316bd063d6d63618d926686";
  const handoff: TerminalReviewHandoffVerdict = {
    ok: true,
    action: "admit_review_request",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    decisive_evidence: [`live head ${head}`, "status surface checks-current-head"],
    blockers: [],
    quarantined_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    warnings: ["Node.js 20 Actions deprecation notice remains warning-only"],
    next_route: "request final review on the live PR head",
  };

  const admitted = compileReviewHandoffPacket({
    handoff,
    live_head_sha: head,
    packet_id: "review-packet-live-head-proof",
    spent_packet_ids: [],
    requested_reviewers: ["timoygeroin"],
    requested_team_reviewers: [],
    status_surface_ids: ["checks-current-head"],
    mergeability_lease_id: "mergeability-live-head-proof",
    prohibited_next_embodiment_classes: ["review_ready_guard_replay", "duplicate_status_summary"],
  });

  assert.equal(admitted.ok, true);
  assert.equal(admitted.action, "compile_review_handoff_packet");
  assert.equal(admitted.packet?.head_sha, head);
  assert.ok(admitted.packet?.forbidden_continuations.includes("review_ready_guard_replay"));
  assert.equal(
    admitted.next_route,
    "use the packet for a live-head reviewer request or review-response intake; do not add another embodiment unless review, status, or mergeability changes",
  );

  const blocked = compileReviewHandoffPacket({
    handoff: { ...handoff, head_sha: "stale-head" },
    live_head_sha: head,
    packet_id: "review-packet-stale-head-proof",
    spent_packet_ids: [],
    requested_reviewers: ["timoygeroin"],
    requested_team_reviewers: [],
    status_surface_ids: ["checks-current-head"],
    prohibited_next_embodiment_classes: [],
  });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.action, "block_stale_handoff_head");
}

runReviewHandoffPacketProof();
