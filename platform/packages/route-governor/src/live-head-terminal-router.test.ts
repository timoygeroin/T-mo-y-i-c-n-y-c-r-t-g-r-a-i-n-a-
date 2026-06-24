import assert from "node:assert/strict";
import test from "node:test";

import {
  routeLiveHeadTerminal,
  type LiveHeadTerminalCandidate,
  type LiveHeadTerminalRouterInput,
} from "./live-head-terminal-router.js";

const repository = "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-";
const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "f2e7c264a605f404cdd83992fc8c2029dda3d503";

function candidate(overrides: Partial<LiveHeadTerminalCandidate> = {}): LiveHeadTerminalCandidate {
  return {
    candidate_id: "terminal-embodiment",
    candidate_class: "external_platform_embodiment",
    branch,
    base_head_sha: liveHead,
    changed_files: ["platform/packages/route-governor/src/live-head-terminal-router.ts"],
    executable_artifacts: ["routeLiveHeadTerminal"],
    routing_artifacts: ["live-head terminal router"],
    proof_artifacts: ["platform/packages/route-governor/src/live-head-terminal-router.test.ts"],
    ...overrides,
  };
}

function input(overrides: Partial<LiveHeadTerminalRouterInput> = {}): LiveHeadTerminalRouterInput {
  return {
    repository_full_name: repository,
    pr_number: 2,
    active_branch: branch,
    live_head_sha: liveHead,
    repaired_head_sha: repairedHead,
    last_status_readback_head_sha: repairedHead,
    draft: false,
    mergeable: true,
    required_approval_count: 1,
    resolved_blocker_ids: ["issue-1-ci-status-readback"],
    candidates: [candidate()],
    ...overrides,
  };
}

test("routes behavior-bearing embodiment ahead of fresh readback and exact blocker", () => {
  const verdict = routeLiveHeadTerminal(
    input({
      candidates: [
        candidate({
          candidate_id: "fresh-readback",
          candidate_class: "fresh_status_readback",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
        }),
        candidate({
          candidate_id: "blocker",
          candidate_class: "exact_external_blocker",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          blocker: "no writable external branch surface is available",
        }),
        candidate(),
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_to_external_embodiment");
  assert.equal(verdict.selected_candidate_id, "terminal-embodiment");
  assert.ok(verdict.decisive_evidence.includes("platform/packages/route-governor/src/live-head-terminal-router.ts"));
  assert.ok(verdict.retired_head_shas.includes(repairedHead));
});

test("admits fresh status readback only when the PR head moved since the last readback", () => {
  const moved = routeLiveHeadTerminal(
    input({
      candidates: [
        candidate({
          candidate_id: "moved-head-readback",
          candidate_class: "fresh_status_readback",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
        }),
      ],
    }),
  );

  assert.equal(moved.ok, true);
  assert.equal(moved.action, "route_to_fresh_status_readback");
  assert.deepEqual(moved.decisive_evidence, [`head moved from ${repairedHead} to ${liveHead}`]);

  const stale = routeLiveHeadTerminal(
    input({
      last_status_readback_head_sha: liveHead,
      candidates: [
        candidate({
          candidate_id: "stale-readback",
          candidate_class: "fresh_status_readback",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
        }),
      ],
    }),
  );

  assert.equal(stale.ok, false);
  assert.equal(stale.action, "block_live_head_terminal_route");
  assert.deepEqual(stale.blockers, ["no live-head terminal candidate survived"]);
  assert.ok(
    stale.rejected.some((rejection) =>
      rejection.reasons.includes("fresh status readback is not fresh because live head equals last status readback head"),
    ),
  );
});

test("blocks retired repaired-head replay and duplicate metadata classes", () => {
  const verdict = routeLiveHeadTerminal(
    input({
      candidates: [
        candidate({
          candidate_id: "repaired-head-replay",
          base_head_sha: repairedHead,
        }),
        candidate({
          candidate_id: "metadata-reread",
          candidate_class: "metadata_reread",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_live_head_terminal_route");
  assert.ok(
    verdict.rejected.some((rejection) =>
      rejection.reasons.includes(`candidate reuses retired repaired head ${repairedHead}`),
    ),
  );
  assert.ok(
    verdict.rejected.some((rejection) =>
      rejection.reasons.includes("live-head terminal candidate class is non-progress: metadata_reread"),
    ),
  );
});

test("routes review before merge until required approvals exist", () => {
  const statusSurface = {
    surface_id: "current-head-status",
    head_sha: liveHead,
    verdict: "passing_with_warnings" as const,
    decisive_successes: ["Monday Platform CI pull_request success"],
    blockers: [],
    warnings: ["Node.js 20 Actions deprecation warning"],
  };

  const review = routeLiveHeadTerminal(
    input({
      status_surface: statusSurface,
      candidates: [
        candidate({
          candidate_id: "merge-without-approval",
          candidate_class: "merge_handoff",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          approvals: [],
        }),
        candidate({
          candidate_id: "review-handoff",
          candidate_class: "review_handoff",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          requested_reviewers: ["timoygeroin"],
        }),
      ],
    }),
  );

  assert.equal(review.ok, true);
  assert.equal(review.action, "route_to_review_handoff");
  assert.equal(review.selected_candidate_id, "review-handoff");

  const merge = routeLiveHeadTerminal(
    input({
      status_surface: statusSurface,
      candidates: [
        candidate({
          candidate_id: "merge-with-approval",
          candidate_class: "merge_handoff",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          approvals: ["timoygeroin"],
        }),
        candidate({
          candidate_id: "review-handoff",
          candidate_class: "review_handoff",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          requested_reviewers: ["timoygeroin"],
        }),
      ],
    }),
  );

  assert.equal(merge.ok, true);
  assert.equal(merge.action, "route_to_merge_handoff");
  assert.equal(merge.selected_candidate_id, "merge-with-approval");
});
