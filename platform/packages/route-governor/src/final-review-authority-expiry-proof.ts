import assert from "node:assert/strict";

import {
  validateFinalReviewAuthorityWindow,
  type FinalReviewAuthorityWindowInput,
} from "./final-review-authority-expiry.js";

const branch = "monday-platform-genesis-01";
const liveHead = "ae6808d6400dea0fdf2709989a7d737ff0046e7f";

function input(overrides: Partial<FinalReviewAuthorityWindowInput> = {}): FinalReviewAuthorityWindowInput {
  return {
    window_id: "final-review-authority-expiry-proof-001",
    spent_window_ids: [],
    active_branch: branch,
    live_head_sha: liveHead,
    observed_latest_head_sha: liveHead,
    authority_branch: branch,
    authority_head_sha: liveHead,
    issued_at: "2026-06-22T08:00:00.000Z",
    expires_at: "2026-06-22T08:30:00.000Z",
    checked_at: "2026-06-22T08:10:00.000Z",
    evidence: ["live-head final review authority assembled"],
    ...overrides,
  };
}

const admitted = validateFinalReviewAuthorityWindow(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_authority_window");

const repairedHead = validateFinalReviewAuthorityWindow(
  input({ authority_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
);
assert.equal(repairedHead.ok, false);
assert.equal(repairedHead.action, "block_head_mismatch");

const superseded = validateFinalReviewAuthorityWindow(
  input({ observed_latest_head_sha: "4244d124e9d069be9aef069535468f0b84e66e9d" }),
);
assert.equal(superseded.ok, false);
assert.equal(superseded.action, "block_superseded_head");

const expired = validateFinalReviewAuthorityWindow(input({ checked_at: "2026-06-22T08:31:00.000Z" }));
assert.equal(expired.ok, false);
assert.equal(expired.action, "block_expired_window");
