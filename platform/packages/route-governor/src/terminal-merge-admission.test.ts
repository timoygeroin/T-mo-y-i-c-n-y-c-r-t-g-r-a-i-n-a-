import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { admitTerminalMergeFinalization, type TerminalMergeAdmissionInput } from "./terminal-merge-admission.js";

const head = "a9b70477f375ff9f2274ff65841fee5f9061c36b";

function input(overrides: Partial<TerminalMergeAdmissionInput> = {}): TerminalMergeAdmissionInput {
  return {
    admission_id: "terminal-merge-admission-live-head-001",
    spent_admission_ids: [],
    command_id: "merge-command-live-head-001",
    spent_command_ids: [],
    active_branch: "monday-platform-genesis-01",
    live_head_sha: head,
    merge_method: "squash",
    review: {
      ok: true,
      action: "route_to_merge_gate",
      repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
      pr_number: 2,
      branch: "monday-platform-genesis-01",
      head_sha: head,
      approvals: ["external-reviewer"],
      change_requests: [],
      pending_reviewers: [],
      decisive_evidence: ["approved by external-reviewer"],
      blockers: [],
      next_route: "enter merge gate only after live-head status and mergeability are still current",
    },
    status: {
      ok: true,
      action: "accept_live_status_evidence",
      branch: "monday-platform-genesis-01",
      head_sha: head,
      accepted_surface_ids: ["checks-current-head"],
      stale_surface_ids: ["prompt-repaired-head"],
      summary_surface_ids: ["pr-body-summary"],
      decisive_evidence: ["checks-current-head:check_run:passing_with_warnings"],
      blockers: [],
      warnings: ["Node.js 20 Actions deprecation warning"],
      next_route: "continue from live-head-bound status evidence without inheriting stale prompt or PR-body summaries",
    },
    readiness: {
      ok: true,
      action: "merge_ready",
      repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
      pr_number: 2,
      branch: "monday-platform-genesis-01",
      head_sha: head,
      decisive_evidence: ["GitHub mergeable true", "current-head status surface checks-current-head"],
      blockers: [],
      warnings: ["Node.js 20 Actions deprecation warning"],
      next_route: "request final review or merge through the authorized GitHub boundary; do not add another embodiment guard unless a new blocker appears",
    },
    ...overrides,
  };
}

describe("admitTerminalMergeFinalization", () => {
  it("admits merge finalization only after review, live status, and readiness converge on the live head", () => {
    const verdict = admitTerminalMergeFinalization(input());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_merge_finalization");
    assert.equal(verdict.command_input?.external_boundary, "github_pull_request_merge");
    assert.equal(verdict.command_input?.live_head_sha, head);
    assert.equal(verdict.command_input?.command_id, "merge-command-live-head-001");
    assert.equal(verdict.command_input?.merge_method, "squash");
    assert.deepEqual(verdict.blockers, []);
    assert(verdict.warnings.includes("Node.js 20 Actions deprecation warning"));
  });

  it("blocks a review response that has not admitted the merge gate", () => {
    const verdict = admitTerminalMergeFinalization(
      input({
        review: {
          ...input().review,
          ok: false,
          action: "route_to_review_repair",
          change_requests: ["external-reviewer"],
          blockers: ["review changes requested by external-reviewer"],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_review_not_approved");
    assert(verdict.blockers.includes("review changes requested by external-reviewer"));
  });

  it("blocks summary or stale status evidence before terminal merge admission", () => {
    const verdict = admitTerminalMergeFinalization(
      input({
        status: {
          ...input().status,
          ok: false,
          action: "block_summary_as_status",
          accepted_surface_ids: [],
          blockers: ["summary surface cannot prove live-head status: pr-body-summary"],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_status_not_accepted");
    assert(verdict.blockers.includes("summary surface cannot prove live-head status: pr-body-summary"));
  });

  it("blocks merge readiness compiled for an older head", () => {
    const verdict = admitTerminalMergeFinalization(
      input({
        readiness: {
          ...input().readiness,
          head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_readiness_head");
    assert.deepEqual(verdict.blockers, [
      `merge readiness head b38ea247602ae8ebba80c4120ad03b41b26bd841 is not live head ${head}`,
    ]);
  });

  it("blocks replayed terminal admissions", () => {
    const verdict = admitTerminalMergeFinalization(
      input({ spent_admission_ids: ["terminal-merge-admission-live-head-001"] }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_replayed_admission");
  });
});
