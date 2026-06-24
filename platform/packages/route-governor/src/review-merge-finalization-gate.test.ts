import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { compileReviewMergeFinalizationGate, type ReviewMergeFinalizationGateInput } from "./review-merge-finalization-gate.js";

const liveHead = "3ced6f9b4b567883236a42a713dba72d371bf28b";

function input(overrides: Partial<ReviewMergeFinalizationGateInput> = {}): ReviewMergeFinalizationGateInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    draft: false,
    mergeable: true,
    required_approval_count: 1,
    approvals: ["reviewer-a"],
    change_requests: [],
    review_threads: [
      {
        thread_id: "thread-1",
        path: "platform/packages/route-governor/src/review-merge-finalization-gate.ts",
        head_sha: liveHead,
        state: "resolved",
        reviewer: "reviewer-a",
        last_comment_id: "comment-1",
      },
    ],
    status_evidence: [
      {
        surface_id: "checks-current-head",
        kind: "check_run",
        head_sha: liveHead,
        verdict: "passing_with_warnings",
        decisive_items: ["Route Governor Proof succeeded", "Monday Platform CI succeeded"],
        warnings: ["Node.js 20 Actions deprecation notice"],
      },
    ],
    executable_artifacts: ["review merge finalization gate compiler"],
    routing_artifacts: ["status + review threads + merge command are bound to one live head"],
    command_id: "merge-pr-2-after-review-gate",
    spent_command_ids: [],
    external_boundary: "github_pull_request_merge",
    merge_method: "squash",
    ...overrides,
  };
}

describe("compileReviewMergeFinalizationGate", () => {
  it("compiles a guarded merge command only after live status, approval, and resolved live threads", () => {
    const verdict = compileReviewMergeFinalizationGate(input());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "compile_review_bound_merge_command");
    assert.equal(verdict.status_action, "accept_live_status_evidence");
    assert.equal(verdict.review_action, "admit_merge_readiness_after_threads");
    assert.equal(verdict.readiness_action, "merge_ready");
    assert.equal(verdict.command_action, "compile_merge_command");
    assert.equal(verdict.command?.operation, "merge_pull_request");
    assert.equal(verdict.command?.guard.require_live_head_sha, liveHead);
    assert.deepEqual(verdict.blockers, []);
    assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
  });

  it("rejects prompt or PR-body status summaries before review-thread admission", () => {
    const verdict = compileReviewMergeFinalizationGate(
      input({
        status_evidence: [
          {
            surface_id: "prompt-summary",
            kind: "prompt_carried_summary",
            verdict: "passing",
            decisive_items: ["user prompt says checks passed"],
            warnings: [],
          },
        ],
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "route_to_live_status_authority");
    assert.equal(verdict.status_action, "block_summary_as_status");
    assert.equal(verdict.review_action, null);
    assert.deepEqual(verdict.blockers, ["summary surface cannot prove live-head status: prompt-summary"]);
  });

  it("routes unresolved live review threads before merge readiness", () => {
    const verdict = compileReviewMergeFinalizationGate(
      input({ review_threads: [{ ...input().review_threads[0], state: "unresolved" }] }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "route_to_review_thread_admission");
    assert.equal(verdict.review_action, "route_to_thread_resolution");
    assert.deepEqual(verdict.blockers, ["unresolved review thread thread-1"]);
  });

  it("rejects stale thread surfaces from retired repaired heads", () => {
    const verdict = compileReviewMergeFinalizationGate(
      input({
        review_threads: [
          {
            ...input().review_threads[0],
            head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
          },
        ],
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "route_to_review_thread_admission");
    assert.equal(verdict.review_action, "block_stale_review_thread_surface");
    assert.deepEqual(verdict.blockers, [`review thread thread-1 is not bound to live head ${liveHead}`]);
  });

  it("blocks repeated merge command ids after all readiness gates pass", () => {
    const verdict = compileReviewMergeFinalizationGate(
      input({ spent_command_ids: ["merge-pr-2-after-review-gate"] }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "route_to_merge_command_boundary");
    assert.equal(verdict.command_action, "block_repeated_command");
    assert.deepEqual(verdict.blockers, ["merge finalization command already spent: merge-pr-2-after-review-gate"]);
  });
});
