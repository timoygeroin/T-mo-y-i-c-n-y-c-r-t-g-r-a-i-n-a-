import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  guardMergedPrActiveSink,
  type MergedPrActiveSinkGuardInput,
} from "./merged-pr-active-sink-guard.js";

const branch = "monday-platform-genesis-01";
const head = "4fbd48ca4539986c874f85394188c405b8d25600";
const mergeCommit = "744387e081b4126ddba74d03ee11588e76ed3789";

function input(overrides: Partial<MergedPrActiveSinkGuardInput> = {}): MergedPrActiveSinkGuardInput {
  return {
    expected_pr_number: 2,
    expected_branch: branch,
    expected_head_sha: head,
    successor_sink_available: false,
    observed: {
      pr_number: 2,
      branch,
      head_sha: head,
      state: "closed",
      merged: true,
      merge_commit_sha: mergeCommit,
    },
    ...overrides,
  };
}

describe("guardMergedPrActiveSink", () => {
  it("blocks reuse of a merged PR when no successor sink is available", () => {
    const verdict = guardMergedPrActiveSink(input());

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "emit_consumed_sink_blocker");
    assert.match(verdict.blockers.join("; "), /cannot be reused as the active embodiment sink/);
    assert.match(verdict.next_route, /successor PR/);
  });

  it("routes to a successor sink after merge completion when one is available", () => {
    const verdict = guardMergedPrActiveSink(
      input({ successor_sink_available: true, successor_sink_id: "monday-platform-genesis-02" }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "route_to_successor_sink");
    assert.ok(verdict.decisive_evidence.includes(`merge commit ${mergeCommit}`));
    assert.match(verdict.next_route, /successor sink/);
  });

  it("admits the PR sink only while it is still open and unmerged", () => {
    const verdict = guardMergedPrActiveSink(
      input({
        observed: {
          pr_number: 2,
          branch,
          head_sha: head,
          state: "open",
          merged: false,
          merge_commit_sha: null,
        },
      }),
    );

    assert.equal(verdict.ok, true);
    assert.equal(verdict.action, "admit_active_pr_sink");
  });

  it("requires a fresh head-bound readback when the observed PR head differs", () => {
    const verdict = guardMergedPrActiveSink(
      input({ observed: { ...input().observed, head_sha: "new-head" } }),
    );

    assert.equal(verdict.ok, false);
    assert.equal(verdict.action, "block_stale_observed_head");
    assert.match(verdict.next_route, /fresh head-bound readback/);
  });
});
