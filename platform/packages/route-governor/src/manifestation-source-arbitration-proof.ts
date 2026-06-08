import assert from "node:assert/strict";

import {
  arbitrateManifestationSources,
  type ManifestationSourceArbitrationInput,
} from "./manifestation-source-arbitration.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "bbc6f72efc123a733f25e8834853a2a422534ae5";

function input(overrides: Partial<ManifestationSourceArbitrationInput> = {}): ManifestationSourceArbitrationInput {
  return {
    active_branch: branch,
    live_pr_branch: branch,
    prompt_head_sha: repairedHead,
    live_pr_head_sha: liveHead,
    resolved_repaired_head_sha: repairedHead,
    repaired_head_status_resolved: true,
    blocker_issue_state: "closed",
    blocker_label_present: false,
    sources: [
      {
        kind: "prompt_carried_head",
        head_sha: repairedHead,
        evidence_id: "scheduled-prompt",
        evidence: "scheduled prompt still names the repaired head",
      },
      {
        kind: "blocker_issue",
        head_sha: repairedHead,
        evidence_id: "issue-1",
        evidence: "issue #1 is closed as completed for the repaired head",
      },
      {
        kind: "live_pr_metadata",
        branch,
        head_sha: liveHead,
        evidence_id: "pr-2-metadata",
        evidence: "PR #2 reports a moved live head",
      },
    ],
    ...overrides,
  };
}

const movedWithoutStatus = arbitrateManifestationSources(input());
assert.equal(movedWithoutStatus.ok, true);
assert.equal(movedWithoutStatus.action, "require_live_head_status");
assert.equal(movedWithoutStatus.prompt_head_allowed, false);
assert.match(movedWithoutStatus.next_route, /status source for the live PR head/);

const resurrectedBlocker = arbitrateManifestationSources(input({ attempted_blocker: "old_repaired_head_blocker" }));
assert.equal(resurrectedBlocker.ok, false);
assert.equal(resurrectedBlocker.action, "block_repaired_head_resurrection");
assert.deepEqual(resurrectedBlocker.blockers, [`old repaired-head blocker cannot be emitted for ${repairedHead}`]);

const staleStatus = arbitrateManifestationSources(
  input({
    sources: [
      ...input().sources,
      {
        kind: "workflow_status_readback",
        head_sha: repairedHead,
        verdict: "passing_with_warnings",
        evidence_id: "old-readback",
        evidence: "repaired-head checks passed",
      },
    ],
  }),
);
assert.equal(staleStatus.ok, true);
assert.equal(staleStatus.action, "require_live_head_status");
assert.deepEqual(staleStatus.blockers, [
  `stale status source workflow_status_readback:old-readback@${repairedHead} cannot decide live head ${liveHead}`,
]);

const liveFailure = arbitrateManifestationSources(
  input({
    sources: [
      ...input().sources,
      {
        kind: "public_checks_summary",
        head_sha: liveHead,
        verdict: "failing",
        evidence_id: "checks-tab",
        evidence: "Monday Platform CI / Run proof examples failed with exit code 1",
      },
    ],
  }),
);
assert.equal(liveFailure.ok, true);
assert.equal(liveFailure.action, "repair_live_head_failure");
assert.match(liveFailure.decisive_evidence.join("\n"), /Run proof examples failed/);

const pendingLive = arbitrateManifestationSources(
  input({
    sources: [
      ...input().sources,
      {
        kind: "workflow_status_readback",
        head_sha: liveHead,
        verdict: "pending",
        evidence_id: "readback-run",
        evidence: "PR Head Status Readback is still in progress",
      },
    ],
  }),
);
assert.equal(pendingLive.ok, false);
assert.equal(pendingLive.action, "wait_for_live_head_checks");

const passingLive = arbitrateManifestationSources(
  input({
    sources: [
      ...input().sources,
      {
        kind: "workflow_status_readback",
        head_sha: liveHead,
        verdict: "passing_with_warnings",
        evidence_id: "readback-run",
        evidence: "live-head checks passed; Node.js 20 deprecation warning remains non-blocking",
      },
    ],
  }),
);
assert.equal(passingLive.ok, true);
assert.equal(passingLive.action, "continue_from_live_head");
assert.equal(passingLive.prompt_head_allowed, false);

const promptStillLive = arbitrateManifestationSources(
  input({
    live_pr_head_sha: repairedHead,
    sources: [
      {
        kind: "prompt_carried_head",
        head_sha: repairedHead,
        evidence_id: "scheduled-prompt",
        evidence: "scheduled prompt names the repaired head",
      },
      {
        kind: "live_pr_metadata",
        branch,
        head_sha: repairedHead,
        evidence_id: "pr-2-metadata",
        evidence: "PR #2 still reports the repaired head",
      },
    ],
  }),
);
assert.equal(promptStillLive.ok, true);
assert.equal(promptStillLive.action, "continue_from_live_head");
assert.equal(promptStillLive.prompt_head_allowed, true);

console.log("manifestation source arbitration proof passed");
