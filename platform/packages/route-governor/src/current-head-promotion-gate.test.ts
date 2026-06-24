import test from "node:test";
import assert from "node:assert/strict";

import { gateCurrentHeadPromotion } from "./current-head-promotion-gate.js";

const head = "fd5cfc087b6011005b8b5320dbfdb52b47aee069";

test("admits promotion only when all required authorities cite the live head", () => {
  const verdict = gateCurrentHeadPromotion({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: head,
    promotion_id: "current-head-promotion-live-head-001",
    spent_promotion_ids: [],
    target: "merge_gate",
    required_authorities: ["status", "review", "mergeability"],
    authorities: [
      {
        authority_id: "checks-current-head",
        kind: "status",
        branch: "monday-platform-genesis-01",
        head_sha: head,
        ok: true,
        evidence: ["Route Governor Proof succeeded", "Monday Platform CI succeeded"],
      },
      {
        authority_id: "review-response-current-head",
        kind: "review",
        branch: "monday-platform-genesis-01",
        head_sha: head,
        ok: true,
        evidence: ["required review approved"],
      },
      {
        authority_id: "mergeability-current-head",
        kind: "mergeability",
        branch: "monday-platform-genesis-01",
        head_sha: head,
        ok: true,
        evidence: ["mergeable true"],
      },
    ],
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_current_head_promotion");
  assert.equal(verdict.next_route.includes("PR head remains unchanged"), true);
});

test("blocks historical repaired-head status from promoting the current head", () => {
  const verdict = gateCurrentHeadPromotion({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: head,
    promotion_id: "current-head-promotion-live-head-002",
    spent_promotion_ids: [],
    target: "merge_gate",
    required_authorities: ["status", "review", "mergeability"],
    authorities: [
      {
        authority_id: "checks-repaired-head",
        kind: "status",
        branch: "monday-platform-genesis-01",
        head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
        ok: true,
        evidence: ["historical repaired-head checks succeeded"],
      },
      {
        authority_id: "review-response-current-head",
        kind: "review",
        branch: "monday-platform-genesis-01",
        head_sha: head,
        ok: true,
        evidence: ["required review approved"],
      },
      {
        authority_id: "mergeability-current-head",
        kind: "mergeability",
        branch: "monday-platform-genesis-01",
        head_sha: head,
        ok: true,
        evidence: ["mergeable true"],
      },
    ],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_authority");
  assert.deepEqual(verdict.blockers, [
    "status authority checks-repaired-head cites b38ea247602ae8ebba80c4120ad03b41b26bd841, not fd5cfc087b6011005b8b5320dbfdb52b47aee069",
  ]);
});

test("blocks promotion when a required authority class is missing", () => {
  const verdict = gateCurrentHeadPromotion({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: head,
    promotion_id: "current-head-promotion-live-head-003",
    spent_promotion_ids: [],
    target: "merge_gate",
    required_authorities: ["status", "review", "mergeability"],
    authorities: [
      {
        authority_id: "checks-current-head",
        kind: "status",
        branch: "monday-platform-genesis-01",
        head_sha: head,
        ok: true,
        evidence: ["checks succeeded"],
      },
      {
        authority_id: "mergeability-current-head",
        kind: "mergeability",
        branch: "monday-platform-genesis-01",
        head_sha: head,
        ok: true,
        evidence: ["mergeable true"],
      },
    ],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_authority");
  assert.deepEqual(verdict.blockers, ["missing review authority for merge_gate"]);
});

test("blocks pending authority before downstream promotion", () => {
  const verdict = gateCurrentHeadPromotion({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: head,
    promotion_id: "current-head-promotion-live-head-004",
    spent_promotion_ids: [],
    target: "review_response_intake",
    required_authorities: ["status"],
    authorities: [
      {
        authority_id: "checks-current-head",
        kind: "status",
        branch: "monday-platform-genesis-01",
        head_sha: head,
        ok: false,
        pending: true,
        evidence: ["checks still running"],
      },
    ],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_pending_authority");
});

test("blocks spent promotion ids", () => {
  const verdict = gateCurrentHeadPromotion({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: head,
    promotion_id: "current-head-promotion-live-head-001",
    spent_promotion_ids: ["current-head-promotion-live-head-001"],
    target: "merge_gate",
    required_authorities: ["status"],
    authorities: [],
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_reused_promotion");
});
