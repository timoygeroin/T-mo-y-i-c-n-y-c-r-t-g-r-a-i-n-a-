import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  reconcilePromptHeadWithLiveHead,
  type PromptHeadReconciliationInput,
} from "./prompt-head-reconciliation.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "fd0ddbaf906df4630bac271ddc804e3d1b7658fd";
const oldBlocker = "repaired-head status readback is missing for b38ea247602ae8ebba80c4120ad03b41b26bd841";

function input(overrides: Partial<PromptHeadReconciliationInput> = {}): PromptHeadReconciliationInput {
  return {
    branch,
    active_branch: branch,
    prompt_head_sha: repairedHead,
    live_head_sha: liveHead,
    resolved_repaired_head_sha: repairedHead,
    resolved_repaired_head_status: true,
    prohibited_blockers: [oldBlocker],
    ...overrides,
  };
}

describe("reconcilePromptHeadWithLiveHead", () => {
  it("routes a stale prompt-carried repaired head to live-head status readback", () => {
    const verdict = reconcilePromptHeadWithLiveHead(input());

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "read_live_head_status");
    assert.equal(verdict.prompt_head_allowed, false);
    assert.deepEqual(verdict.blockers, []);
    assert.match(verdict.decisive_evidence[0], /PR head moved/);
  });

  it("blocks the old repaired-head blocker after the boundary is resolved", () => {
    const verdict = reconcilePromptHeadWithLiveHead(input({ attempted_blocker: oldBlocker }));

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_prompt_head");
    assert.equal(verdict.prompt_head_allowed, false);
    assert.match(verdict.blockers[0], /prohibited prompt-carried blocker/);
  });

  it("routes a failing live-head status surface to concrete repair", () => {
    const verdict = reconcilePromptHeadWithLiveHead(
      input({
        live_status_surface: {
          verdict: "failing",
          ok: false,
          decisive_successes: [],
          blocking_failures: ["Route governor proof examples failed on live head"],
          pending_surfaces: [],
          non_blocking_warnings: ["Node.js 20 Actions deprecation notice"],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "repair_live_head_failure");
    assert.deepEqual(verdict.blockers, ["Route governor proof examples failed on live head"]);
    assert.deepEqual(verdict.warnings, ["Node.js 20 Actions deprecation notice"]);
  });

  it("keeps pending live-head checks as wait state, not repaired-head replay", () => {
    const verdict = reconcilePromptHeadWithLiveHead(
      input({
        live_status_surface: {
          verdict: "pending",
          ok: false,
          decisive_successes: [],
          blocking_failures: [],
          pending_surfaces: ["Monday Platform CI is in progress on live head"],
          non_blocking_warnings: [],
        },
      }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "wait_for_live_head_checks");
    assert.deepEqual(verdict.blockers, ["Monday Platform CI is in progress on live head"]);
  });

  it("accepts the prompt head only when it is also live and resolved", () => {
    const verdict = reconcilePromptHeadWithLiveHead(
      input({
        prompt_head_sha: repairedHead,
        live_head_sha: repairedHead,
      }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "accept_prompt_head");
    assert.equal(verdict.prompt_head_allowed, true);
  });
});
