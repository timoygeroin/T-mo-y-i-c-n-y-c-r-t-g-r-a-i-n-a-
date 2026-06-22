import assert from "node:assert/strict";
import test from "node:test";

import {
  validateFinalReviewAuthorityWindow,
  type FinalReviewAuthorityWindowInput,
} from "./final-review-authority-expiry.js";

const branch = "monday-platform-genesis-01";
const head = "ae6808d6400dea0fdf2709989a7d737ff0046e7f";

function input(overrides: Partial<FinalReviewAuthorityWindowInput> = {}): FinalReviewAuthorityWindowInput {
  return {
    window_id: "final-review-window-live-head-001",
    spent_window_ids: [],
    active_branch: branch,
    live_head_sha: head,
    observed_latest_head_sha: head,
    authority_branch: branch,
    authority_head_sha: head,
    issued_at: "2026-06-22T08:00:00.000Z",
    expires_at: "2026-06-22T08:30:00.000Z",
    checked_at: "2026-06-22T08:10:00.000Z",
    evidence: ["status, mergeability, review, and blocker-retirement leases assembled"],
    ...overrides,
  };
}

test("admits a live-head authority window before expiry", () => {
  const verdict = validateFinalReviewAuthorityWindow(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_authority_window");
  assert.equal(verdict.branch, branch);
  assert.equal(verdict.head_sha, head);
  assert.match(verdict.next_route, /before expiry/);
});

test("blocks reused authority windows", () => {
  const verdict = validateFinalReviewAuthorityWindow(
    input({ spent_window_ids: ["final-review-window-live-head-001"] }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_reused_window");
});

test("blocks stale repaired-head authority", () => {
  const verdict = validateFinalReviewAuthorityWindow(
    input({ authority_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_head_mismatch");
  assert.match(verdict.blockers.join("\n"), /not live head/);
});

test("blocks authority when a newer PR head is observed", () => {
  const verdict = validateFinalReviewAuthorityWindow(
    input({ observed_latest_head_sha: "4244d124e9d069be9aef069535468f0b84e66e9d" }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_superseded_head");
  assert.match(verdict.next_route, /moved-head status/);
});

test("blocks expired authority windows", () => {
  const verdict = validateFinalReviewAuthorityWindow(
    input({ checked_at: "2026-06-22T08:30:00.000Z" }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_expired_window");
});

test("blocks invalid timestamp boundaries", () => {
  const verdict = validateFinalReviewAuthorityWindow(input({ expires_at: "not-a-time" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_missing_time_boundary");
});

test("blocks windows before their not-before boundary", () => {
  const verdict = validateFinalReviewAuthorityWindow(
    input({ not_before: "2026-06-22T08:20:00.000Z" }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_not_yet_active");
});
