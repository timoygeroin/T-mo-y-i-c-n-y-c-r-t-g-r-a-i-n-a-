import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compileFinalizationTerminalDispatch } from "./finalization-terminal-dispatch.js";
import type { MergeGateFreshnessVerdict } from "./merge-gate-freshness.js";

const liveHead = "719836f38cb49dc20dd3712174561e0fa9e9f5a6";

function freshGate(overrides: Partial<MergeGateFreshnessVerdict> = {}): MergeGateFreshnessVerdict {
  return {
    ok: true,
    action: "admit_fresh_merge_gate",
    gate_id: `merge-gate-pr-2:${liveHead}`,
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    head_sha: liveHead,
    approvals: ["external-reviewer"],
    decisive_evidence: [
      `gate merge-gate-pr-2:${liveHead}`,
      `live head ${liveHead}`,
      "approved by external-reviewer",
      "current-head status surface succeeded",
    ],
    blockers: [],
    warnings: ["Node.js 20 Actions deprecation notice"],
    next_route: "compile a merge command only from this fresh live-head gate",
    ...overrides,
  };
}

describe("compileFinalizationTerminalDispatch", () => {
  it("dispatches a guarded merge command from a fresh live-head merge gate", () => {
    const verdict = compileFinalizationTerminalDispatch({
      merge_gate: freshGate(),
      live_head_sha: liveHead,
      requested_action: "merge",
      dispatch_id: `terminal-dispatch-pr-2:${liveHead}`,
      spent_dispatch_ids: [],
    });

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "dispatch_merge_command");
    assert.equal(verdict.command?.operation, "compile_merge_command");
    assert.equal(verdict.command?.expected_head_sha, liveHead);
    assert.equal(verdict.command?.source_gate_id, `merge-gate-pr-2:${liveHead}`);
    assert.equal(verdict.command?.forbidden_fallbacks.includes("duplicate_status_summary"), true);
  });

  it("blocks weaker terminal routes after a fresh merge gate exists", () => {
    const verdict = compileFinalizationTerminalDispatch({
      merge_gate: freshGate(),
      live_head_sha: liveHead,
      requested_action: "request_review",
      dispatch_id: `terminal-dispatch-pr-2:${liveHead}:review-repeat`,
      spent_dispatch_ids: [],
    });

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_weaker_terminal_dispatch");
    assert.equal(verdict.blockers.some((blocker) => blocker.includes("would repeat a weaker route class")), true);
  });

  it("blocks stale merge gates when the PR head moves", () => {
    const movedHead = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const verdict = compileFinalizationTerminalDispatch({
      merge_gate: freshGate(),
      live_head_sha: movedHead,
      requested_action: "merge",
      dispatch_id: `terminal-dispatch-pr-2:${movedHead}`,
      spent_dispatch_ids: [],
    });

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_merge_gate");
    assert.equal(verdict.next_route.includes("moved PR head"), true);
  });

  it("blocks replayed dispatch ids", () => {
    const dispatchId = `terminal-dispatch-pr-2:${liveHead}`;
    const verdict = compileFinalizationTerminalDispatch({
      merge_gate: freshGate(),
      live_head_sha: liveHead,
      requested_action: "merge",
      dispatch_id: dispatchId,
      spent_dispatch_ids: [dispatchId],
    });

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_replayed_dispatch_id");
  });

  it("admits one exact external blocker without pretending it is a merge dispatch", () => {
    const verdict = compileFinalizationTerminalDispatch({
      merge_gate: freshGate({ ok: false, action: "block_unapproved_review_gate", blockers: ["review approval absent"] }),
      live_head_sha: liveHead,
      requested_action: "emit_blocker",
      dispatch_id: "",
      spent_dispatch_ids: [],
      exact_blocker: "external reviewer approval has not surfaced on the live head",
    });

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "emit_exact_external_blocker");
    assert.equal(verdict.command, null);
    assert.deepEqual(verdict.blockers, ["external reviewer approval has not surfaced on the live head"]);
  });
});
