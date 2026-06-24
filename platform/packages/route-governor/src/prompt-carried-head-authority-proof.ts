import assert from "node:assert/strict";

import { resolvePromptCarriedHeadAuthority } from "./prompt-carried-head-authority.js";

const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "9922db996f941a38ebc92766e17ac4a3cdf56107";
const resolvedBoundaries = [
  {
    head_sha: repairedHead,
    status_readback_surfaced: true,
    blocker_retired: true,
    evidence: [
      "Monday Platform CI push run 27049650678 succeeded",
      "Route Governor Proof push run 27049650677 succeeded",
      "PR Head Status Readback pull_request run 27049651467 succeeded",
      "Issue #1 closed as completed",
      "blocked: ci-status-readback removed",
    ],
  },
];

const embodiment = resolvePromptCarriedHeadAuthority({
  branch: "monday-platform-genesis-01",
  prompt_carried_head_sha: repairedHead,
  live_head_sha: liveHead,
  resolved_boundaries: resolvedBoundaries,
  requested_next_action: "external_platform_embodiment",
});

assert.equal(embodiment.ok, true);
assert.equal(embodiment.action, "route_to_live_head_embodiment");
assert.equal(embodiment.authority_head_sha, liveHead);
assert.equal(embodiment.blockers.length, 0);

const replayedBlocker = resolvePromptCarriedHeadAuthority({
  branch: "monday-platform-genesis-01",
  prompt_carried_head_sha: repairedHead,
  live_head_sha: liveHead,
  resolved_boundaries: resolvedBoundaries,
  requested_next_action: "repaired_head_blocker",
});

assert.equal(replayedBlocker.ok, false);
assert.equal(replayedBlocker.action, "block_resolved_boundary_replay");
assert.deepEqual(replayedBlocker.blockers, [`repaired-head blocker for ${repairedHead} is already retired`]);

const status = resolvePromptCarriedHeadAuthority({
  branch: "monday-platform-genesis-01",
  prompt_carried_head_sha: repairedHead,
  live_head_sha: liveHead,
  resolved_boundaries: resolvedBoundaries,
  requested_next_action: "fresh_status_readback",
});

assert.equal(status.ok, true);
assert.equal(status.action, "route_to_fresh_live_head_status");
assert.equal(status.authority_head_sha, liveHead);
