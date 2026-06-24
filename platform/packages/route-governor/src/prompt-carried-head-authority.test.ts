import test from "node:test";
import assert from "node:assert/strict";

import { resolvePromptCarriedHeadAuthority, type ResolvedHeadBoundary } from "./prompt-carried-head-authority.js";

const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "9922db996f941a38ebc92766e17ac4a3cdf56107";
const resolvedBoundary: ResolvedHeadBoundary = {
  head_sha: repairedHead,
  status_readback_surfaced: true,
  blocker_retired: true,
  evidence: ["seven repaired-head checks succeeded", "blocked: ci-status-readback removed", "issue #1 closed as completed"],
};

test("routes a resolved prompt-carried repaired head to live-head embodiment authority", () => {
  const verdict = resolvePromptCarriedHeadAuthority({
    branch: "monday-platform-genesis-01",
    prompt_carried_head_sha: repairedHead,
    live_head_sha: liveHead,
    resolved_boundaries: [resolvedBoundary],
    requested_next_action: "external_platform_embodiment",
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_to_live_head_embodiment");
  assert.equal(verdict.authority_head_sha, liveHead);
  assert.deepEqual(verdict.blockers, []);
  assert.match(verdict.next_route, /live PR head/);
});

test("blocks resurrection of the repaired-head blocker after the boundary is resolved", () => {
  const verdict = resolvePromptCarriedHeadAuthority({
    branch: "monday-platform-genesis-01",
    prompt_carried_head_sha: repairedHead,
    live_head_sha: liveHead,
    resolved_boundaries: [resolvedBoundary],
    requested_next_action: "repaired_head_blocker",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_resolved_boundary_replay");
  assert.deepEqual(verdict.blockers, [`repaired-head blocker for ${repairedHead} is already retired`]);
});

test("admits fresh status routing only as live-head authority when the head moved", () => {
  const verdict = resolvePromptCarriedHeadAuthority({
    branch: "monday-platform-genesis-01",
    prompt_carried_head_sha: repairedHead,
    live_head_sha: liveHead,
    resolved_boundaries: [resolvedBoundary],
    requested_next_action: "fresh_status_readback",
  });

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "route_to_fresh_live_head_status");
  assert.equal(verdict.authority_head_sha, liveHead);
  assert.match(verdict.next_route, /checks bound to the live PR head/);
});

test("rejects metadata rereads and duplicate summaries as non-progress", () => {
  const verdict = resolvePromptCarriedHeadAuthority({
    branch: "monday-platform-genesis-01",
    prompt_carried_head_sha: repairedHead,
    live_head_sha: liveHead,
    resolved_boundaries: [resolvedBoundary],
    requested_next_action: "metadata_reread",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_action");
  assert.deepEqual(verdict.blockers, ["metadata_reread cannot consume prompt-carried head authority as progress"]);
});

test("blocks drift when the prompt head differs from live head without a resolved receipt", () => {
  const verdict = resolvePromptCarriedHeadAuthority({
    branch: "monday-platform-genesis-01",
    prompt_carried_head_sha: repairedHead,
    live_head_sha: liveHead,
    resolved_boundaries: [],
    requested_next_action: "external_platform_embodiment",
  });

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_prompt_head_authority");
  assert.deepEqual(verdict.blockers, [
    `prompt head ${repairedHead} differs from live head ${liveHead} without a resolved-boundary receipt`,
  ]);
});
