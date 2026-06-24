import assert from "node:assert/strict";
import test from "node:test";

import { guardTerminalAuthorityExpiry, type TerminalAuthoritySurface } from "./terminal-authority-expiry.js";

const liveHead = "2d211807597837f5296be2654784739278ec4852";

function authority(overrides: Partial<TerminalAuthoritySurface> = {}): TerminalAuthoritySurface {
  return {
    authority_id: "terminal-authority-001",
    kind: "merge_command",
    branch: "monday-platform-genesis-01",
    head_sha: liveHead,
    target: "merge_finalization",
    evidence: ["live-head status lease", "mergeability lease", "review authority"],
    blockers: [],
    ...overrides,
  };
}

test("admits one live-head terminal authority for its exact target", () => {
  const verdict = guardTerminalAuthorityExpiry({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    spent_authority_ids: [],
    expected_target: "merge_finalization",
    authority: authority(),
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_terminal_authority");
  assert.deepEqual(verdict.blockers, []);
});

test("expires authority when the PR head has moved", () => {
  const verdict = guardTerminalAuthorityExpiry({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: "next-live-head",
    spent_authority_ids: [],
    expected_target: "merge_finalization",
    authority: authority(),
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "expire_head_moved_authority");
  assert.deepEqual(verdict.expired_authority_ids, ["terminal-authority-001"]);
});

test("blocks replayed or already consumed terminal authority", () => {
  const replayed = guardTerminalAuthorityExpiry({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    spent_authority_ids: ["terminal-authority-001"],
    expected_target: "merge_finalization",
    authority: authority(),
  });

  assert.equal(replayed.ok, false);
  assert.equal(replayed.action, "block_replayed_authority");

  const consumed = guardTerminalAuthorityExpiry({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    spent_authority_ids: [],
    expected_target: "merge_finalization",
    authority: authority({ consumed: true }),
  });

  assert.equal(consumed.ok, false);
  assert.equal(consumed.action, "block_consumed_authority");
});

test("blocks authority for the wrong target or wrong branch", () => {
  const wrongTarget = guardTerminalAuthorityExpiry({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    spent_authority_ids: [],
    expected_target: "merge_finalization",
    authority: authority({ target: "review_request" }),
  });

  assert.equal(wrongTarget.ok, false);
  assert.equal(wrongTarget.action, "block_target_mismatch");

  const wrongBranch = guardTerminalAuthorityExpiry({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    spent_authority_ids: [],
    expected_target: "merge_finalization",
    authority: authority({ branch: "main" }),
  });

  assert.equal(wrongBranch.ok, false);
  assert.equal(wrongBranch.action, "block_branch_mismatch");
});

test("routes exact external blockers without converting them into merge authority", () => {
  const verdict = guardTerminalAuthorityExpiry({
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    spent_authority_ids: [],
    expected_target: "exact_blocker",
    authority: authority({
      authority_id: "terminal-blocker-001",
      kind: "exact_external_blocker",
      target: "exact_blocker",
      exact_blocker: "external reviewer approval has not surfaced on the live head",
    }),
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "emit_exact_external_blocker");
  assert.deepEqual(verdict.blockers, ["external reviewer approval has not surfaced on the live head"]);
});
