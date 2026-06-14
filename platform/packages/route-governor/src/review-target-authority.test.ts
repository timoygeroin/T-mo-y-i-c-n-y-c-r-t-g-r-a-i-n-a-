import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveReviewTargetAuthority, type ReviewTargetAuthorityInput } from "./review-target-authority.js";
import type { TerminalReviewHandoffVerdict } from "./terminal-review-handoff.js";

const head = "4ad710770b24946f2f7ccc95282bcd4b180fa63f";

function handoff(overrides: Partial<TerminalReviewHandoffVerdict> = {}): TerminalReviewHandoffVerdict {
  return {
    ok: true,
    action: "admit_review_request",
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: head,
    decisive_evidence: [`live head ${head}`, "status surface current-head-readback"],
    blockers: [],
    quarantined_heads: ["b38ea247602ae8ebba80c4120ad03b41b26bd841"],
    warnings: ["Node.js 20 Actions deprecation notice"],
    next_route: "request final review on the live PR head",
    ...overrides,
  };
}

function input(overrides: Partial<ReviewTargetAuthorityInput> = {}): ReviewTargetAuthorityInput {
  return {
    handoff: handoff(),
    requested_reviewers: ["z-reviewer", "a-reviewer", "a-reviewer"],
    requested_team_reviewers: ["platform-team"],
    acting_user: "mondayid-bot",
    pr_author: "timoygeroin",
    target_set_id: `review-targets:${head}:01`,
    spent_target_set_ids: [],
    ...overrides,
  };
}

test("admits normalized non-self review targets for an admitted terminal handoff", () => {
  const verdict = resolveReviewTargetAuthority(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_review_targets");
  assert.deepEqual(verdict.reviewers, ["a-reviewer", "z-reviewer"]);
  assert.deepEqual(verdict.team_reviewers, ["platform-team"]);
  assert.equal(verdict.target_set_id, `review-targets:${head}:01`);
  assert(verdict.decisive_evidence.includes(`reviewer:a-reviewer`));
});

test("converts missing targets into an exact external blocker", () => {
  const verdict = resolveReviewTargetAuthority(
    input({
      requested_reviewers: [],
      requested_team_reviewers: [],
      exact_blocker: "NO_REAL_REVIEW_TARGET_AVAILABLE_FOR_PR_2",
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "emit_exact_review_target_blocker");
  assert.deepEqual(verdict.blockers, ["NO_REAL_REVIEW_TARGET_AVAILABLE_FOR_PR_2"]);
});

test("blocks placeholder review targets before command compilation", () => {
  const verdict = resolveReviewTargetAuthority(input({ requested_reviewers: ["platform-reviewer"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_placeholder_targets");
  assert(verdict.blockers.some((blocker) => blocker.includes("platform-reviewer")));
});

test("blocks self-review targets for acting user or PR author", () => {
  const verdict = resolveReviewTargetAuthority(input({ requested_reviewers: ["timoygeroin", "mondayid-bot"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_self_review_targets");
  assert(verdict.blockers.some((blocker) => blocker.includes("timoygeroin")));
  assert(verdict.blockers.some((blocker) => blocker.includes("mondayid-bot")));
});

test("blocks target-set replay", () => {
  const verdict = resolveReviewTargetAuthority(input({ spent_target_set_ids: [`review-targets:${head}:01`] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_target_set");
});

test("blocks target resolution when terminal handoff is not admitted", () => {
  const verdict = resolveReviewTargetAuthority(
    input({
      handoff: handoff({
        ok: false,
        action: "route_to_status_readback",
        blockers: ["no status surface is attached for live head"],
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unadmitted_handoff");
});
