import test from "node:test";
import assert from "node:assert/strict";

import {
  compileFinalizationTerminalDecision,
  type FinalizationTerminalDecisionCandidate,
  type FinalizationTerminalDecisionInput,
} from "./finalization-terminal-decision.js";

const liveHead = "95d13f015619d6fa26a40b6b55d006b8ad34000c";

function candidate(
  overrides: Partial<FinalizationTerminalDecisionCandidate> = {},
): FinalizationTerminalDecisionCandidate {
  return {
    candidate_id: "embodiment",
    candidate_class: "external_platform_embodiment",
    branch: "monday-platform-genesis-01",
    base_head_sha: liveHead,
    changed_files: ["platform/packages/route-governor/src/finalization-terminal-decision.ts"],
    executable_artifacts: ["compileFinalizationTerminalDecision"],
    routing_artifacts: ["terminal finalization decision compiler"],
    proof_artifacts: ["platform/packages/route-governor/src/finalization-terminal-decision-proof.ts"],
    ...overrides,
  };
}

function input(overrides: Partial<FinalizationTerminalDecisionInput> = {}): FinalizationTerminalDecisionInput {
  return {
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
    candidates: [candidate()],
    ...overrides,
  };
}

test("selects merge handoff over review and embodiment when approval is present", () => {
  const verdict = compileFinalizationTerminalDecision(
    input({
      candidates: [
        candidate({
          candidate_id: "review",
          candidate_class: "review_handoff",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          requested_reviewers: ["external-reviewer"],
        }),
        candidate(),
        candidate({
          candidate_id: "merge",
          candidate_class: "merge_handoff",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          approvals: ["external-reviewer"],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_to_merge_handoff");
  assert.equal(verdict.selected_candidate_id, "merge");
  assert.deepEqual(verdict.blockers, []);
});

test("routes to review handoff when status is passing and no merge approval candidate survives", () => {
  const verdict = compileFinalizationTerminalDecision(
    input({
      candidates: [
        candidate({
          candidate_id: "review",
          candidate_class: "review_handoff",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          requested_reviewers: ["external-reviewer"],
        }),
        candidate({
          candidate_id: "duplicate-summary",
          candidate_class: "duplicate_ci_summary",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_to_review_handoff");
  assert.equal(verdict.selected_candidate_id, "review");
  assert.equal(verdict.rejected[0]?.candidate_id, "duplicate-summary");
});

test("admits behavior-bearing embodiment when review and merge candidates are absent", () => {
  const verdict = compileFinalizationTerminalDecision(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_to_external_embodiment");
  assert.equal(verdict.selected_candidate_id, "embodiment");
  assert.match(verdict.next_route, /commit the executable embodiment/);
});

test("rejects proof-only embodiment as non-progress", () => {
  const verdict = compileFinalizationTerminalDecision(
    input({
      candidates: [
        candidate({
          changed_files: ["platform/packages/route-governor/src/finalization-terminal-decision-proof.ts"],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_terminal_decision");
  assert.match(verdict.rejected[0]?.reasons.join("; "), /behavior-bearing executable file/);
});

test("routes moved live head to fresh status readback", () => {
  const verdict = compileFinalizationTerminalDecision(
    input({
      status_surface: undefined,
      candidates: [
        candidate({
          candidate_id: "fresh-status",
          candidate_class: "fresh_status_readback",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_to_fresh_status_readback");
  assert.equal(verdict.selected_candidate_id, "fresh-status");
});

test("emits exact blocker when it is the only surviving candidate", () => {
  const verdict = compileFinalizationTerminalDecision(
    input({
      candidates: [
        candidate({
          candidate_id: "exact-blocker",
          candidate_class: "exact_external_blocker",
          changed_files: [],
          executable_artifacts: [],
          routing_artifacts: [],
          proof_artifacts: [],
          blocker: "external reviewer approval is missing for merge handoff",
        }),
      ],
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["external reviewer approval is missing for merge handoff"]);
});
