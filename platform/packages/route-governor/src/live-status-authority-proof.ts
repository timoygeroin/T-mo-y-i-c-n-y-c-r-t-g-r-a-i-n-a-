import assert from "node:assert/strict";

import {
  compileLiveStatusAuthority,
  type LiveStatusAuthorityInput,
  type LiveStatusEvidenceSurface,
} from "./live-status-authority.js";

const branch = "monday-platform-genesis-01";
const liveHead = "0a8023ae8f7b92245e21dbea11a332c528ac1771";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function surface(overrides: Partial<LiveStatusEvidenceSurface> = {}): LiveStatusEvidenceSurface {
  return {
    surface_id: "current-check",
    kind: "check_run",
    head_sha: liveHead,
    verdict: "passing",
    decisive_items: ["Route Governor Proof / proof examples succeeded"],
    warnings: [],
    ...overrides,
  };
}

function input(overrides: Partial<LiveStatusAuthorityInput> = {}): LiveStatusAuthorityInput {
  return {
    branch,
    active_branch: branch,
    live_head_sha: liveHead,
    evidence: [surface()],
    ...overrides,
  };
}

const accepted = compileLiveStatusAuthority(
  input({
    evidence: [
      surface({ verdict: "passing_with_warnings", warnings: ["Node.js 20 Actions deprecation notice"] }),
      surface({
        surface_id: "repaired-head-check",
        head_sha: repairedHead,
        decisive_items: ["old repaired-head checks succeeded"],
      }),
      surface({
        surface_id: "pr-body-status-summary",
        kind: "pr_body_summary",
        head_sha: "df3a4035d6841ae19cc32443f0d4ef11449e65ac",
        verdict: "failing",
        decisive_items: ["PR body says an older moved head failed"],
      }),
    ],
  }),
);
assert.equal(accepted.ok, true);
assert.equal(accepted.action, "accept_live_status_evidence");
assert.deepEqual(accepted.accepted_surface_ids, ["current-check"]);
assert.deepEqual(accepted.stale_surface_ids, ["repaired-head-check"]);
assert.deepEqual(accepted.summary_surface_ids, ["pr-body-status-summary"]);
assert.deepEqual(accepted.warnings, ["Node.js 20 Actions deprecation notice"]);

const summaryOnly = compileLiveStatusAuthority(
  input({
    evidence: [
      surface({
        surface_id: "prompt-carried-success",
        kind: "prompt_carried_summary",
        head_sha: repairedHead,
        verdict: "passing",
        decisive_items: ["prompt says repaired head succeeded"],
      }),
    ],
  }),
);
assert.equal(summaryOnly.ok, false);
assert.equal(summaryOnly.action, "block_summary_as_status");
assert.match(summaryOnly.blockers.join("; "), /summary surface cannot prove live-head status/);

const staleOnly = compileLiveStatusAuthority(
  input({
    evidence: [
      surface({
        surface_id: "old-workflow-run",
        kind: "workflow_run",
        head_sha: repairedHead,
        verdict: "passing",
      }),
    ],
  }),
);
assert.equal(staleOnly.ok, false);
assert.equal(staleOnly.action, "block_stale_status_evidence");

const failingLive = compileLiveStatusAuthority(
  input({
    evidence: [
      surface({
        surface_id: "current-proof-failure",
        verdict: "failing",
        decisive_items: ["Run proof examples exited with 1"],
      }),
    ],
  }),
);
assert.equal(failingLive.ok, false);
assert.equal(failingLive.action, "repair_live_failure");
assert.deepEqual(failingLive.blockers, ["Run proof examples exited with 1"]);

const pendingLive = compileLiveStatusAuthority(input({ evidence: [surface({ verdict: "pending" })] }));
assert.equal(pendingLive.ok, false);
assert.equal(pendingLive.action, "hold_for_live_status");

console.log("live status authority proof passed");
