import test from "node:test";
import assert from "node:assert/strict";

import { compileReviewHandoffPacket } from "./review-handoff-packet.js";
import type { TerminalReviewHandoffVerdict } from "./terminal-review-handoff.js";

const head = "4b7910bd3566c35ee316bd063d6d63618d926686";

function handoff(overrides: Partial<TerminalReviewHandoffVerdict> = {}): TerminalReviewHandoffVerdict {
  return {
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
    ...overrides,
  };
}

test("compiles a live-head review handoff packet", () => {
  const verdict = compileReviewHandoffPacket({
    handoff: handoff(),
    live_head_sha: head,
    packet_id: "review-packet-live-head-001",
    spent_packet_ids: [],
    requested_reviewers: ["timoygeroin"],
    requested_team_reviewers: [],
    status_surface_ids: ["checks-current-head"],
    mergeability_lease_id: "mergeability-live-head-001",
    prohibited_next_embodiment_classes: ["review_ready_guard_replay"],
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "compile_review_handoff_packet");
  assert.equal(verdict.packet?.head_sha, head);
  assert.deepEqual(verdict.packet?.allowed_next_operations, [
    "request_pull_request_reviewers",
    "intake_review_response",
    "exact_external_blocker",
  ]);
  assert.ok(verdict.packet?.forbidden_continuations.includes("review_ready_guard_replay"));
});

test("blocks stale terminal handoff heads", () => {
  const verdict = compileReviewHandoffPacket({
    handoff: handoff({ head_sha: "stale-head" }),
    live_head_sha: head,
    packet_id: "review-packet-live-head-002",
    spent_packet_ids: [],
    requested_reviewers: ["timoygeroin"],
    requested_team_reviewers: [],
    status_surface_ids: ["checks-current-head"],
    prohibited_next_embodiment_classes: [],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_handoff_head");
  assert.deepEqual(verdict.blockers, [`terminal handoff head stale-head is not live head ${head}`]);
});

test("blocks missing or placeholder review targets", () => {
  const missing = compileReviewHandoffPacket({
    handoff: handoff(),
    live_head_sha: head,
    packet_id: "review-packet-live-head-003",
    spent_packet_ids: [],
    requested_reviewers: [],
    requested_team_reviewers: [],
    status_surface_ids: ["checks-current-head"],
    prohibited_next_embodiment_classes: [],
  });

  assert.equal(missing.ok, false);
  assert.equal(missing.action, "block_missing_review_target");

  const placeholder = compileReviewHandoffPacket({
    handoff: handoff(),
    live_head_sha: head,
    packet_id: "review-packet-live-head-004",
    spent_packet_ids: [],
    requested_reviewers: ["placeholder-reviewer"],
    requested_team_reviewers: [],
    status_surface_ids: ["checks-current-head"],
    prohibited_next_embodiment_classes: [],
  });

  assert.equal(placeholder.ok, false);
  assert.equal(placeholder.action, "block_placeholder_review_target");
});

test("blocks replayed packets and missing status evidence", () => {
  const replay = compileReviewHandoffPacket({
    handoff: handoff(),
    live_head_sha: head,
    packet_id: "review-packet-live-head-005",
    spent_packet_ids: ["review-packet-live-head-005"],
    requested_reviewers: ["timoygeroin"],
    requested_team_reviewers: [],
    status_surface_ids: ["checks-current-head"],
    prohibited_next_embodiment_classes: [],
  });

  assert.equal(replay.ok, false);
  assert.equal(replay.action, "block_replayed_packet");

  const missingStatus = compileReviewHandoffPacket({
    handoff: handoff(),
    live_head_sha: head,
    packet_id: "review-packet-live-head-006",
    spent_packet_ids: [],
    requested_reviewers: ["timoygeroin"],
    requested_team_reviewers: [],
    status_surface_ids: [],
    prohibited_next_embodiment_classes: [],
  });

  assert.equal(missingStatus.ok, false);
  assert.equal(missingStatus.action, "block_missing_status_evidence");
});
