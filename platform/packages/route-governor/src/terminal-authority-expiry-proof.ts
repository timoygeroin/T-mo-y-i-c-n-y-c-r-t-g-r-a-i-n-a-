import assert from "node:assert/strict";

import { guardTerminalAuthorityExpiry } from "./terminal-authority-expiry.js";

const liveHead = "2d211807597837f5296be2654784739278ec4852";

const admitted = guardTerminalAuthorityExpiry({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  spent_authority_ids: [],
  expected_target: "merge_finalization",
  authority: {
    authority_id: "terminal-authority-live-head-001",
    kind: "merge_command",
    branch: "monday-platform-genesis-01",
    head_sha: liveHead,
    target: "merge_finalization",
    evidence: ["current status lease", "mergeability lease", "review response authority"],
    blockers: [],
  },
});

assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_terminal_authority");
assert.equal(admitted.next_route, "consume this authority exactly once; expire it immediately after use or after any PR head movement");

const expired = guardTerminalAuthorityExpiry({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: "moved-live-head",
  spent_authority_ids: [],
  expected_target: "merge_finalization",
  authority: {
    authority_id: "terminal-authority-live-head-001",
    kind: "merge_command",
    branch: "monday-platform-genesis-01",
    head_sha: liveHead,
    target: "merge_finalization",
    evidence: ["authority was compiled before the branch moved"],
    blockers: [],
  },
});

assert.equal(expired.ok, false);
assert.equal(expired.action, "expire_head_moved_authority");
assert.deepEqual(expired.expired_authority_ids, ["terminal-authority-live-head-001"]);
