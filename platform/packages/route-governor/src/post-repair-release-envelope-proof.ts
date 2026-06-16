import assert from "node:assert/strict";

import { admitPostRepairEmbodiment } from "./post-repair-embodiment-admission.js";
import { compilePostRepairReleaseEnvelope } from "./post-repair-release-envelope.js";

const liveHead = "87147404d4eddfc384255015860596d374963e91";
const branch = "monday-platform-genesis-01";
const changedFile = "platform/packages/route-governor/src/post-repair-release-envelope.ts";
const executableArtifact = "compilePostRepairReleaseEnvelope";
const routingArtifact = "post-repair release envelope";
const proofArtifact = "platform/packages/route-governor/src/post-repair-release-envelope-proof.ts";

const admission = admitPostRepairEmbodiment({
  active_branch: branch,
  live_head_sha: liveHead,
  repaired_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
  last_status_readback_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
  resolved_blocker_ids: ["issue-1-ci-status-readback"],
  live_status_verdict: "passing_with_warnings",
  candidate: {
    candidate_id: `post-repair-release-envelope:${liveHead}`,
    move_class: "external_platform_embodiment",
    branch,
    base_head_sha: liveHead,
    changed_files: [changedFile],
    executable_artifacts: [executableArtifact],
    routing_artifacts: [routingArtifact],
    proof_artifacts: [proofArtifact],
  },
});

assert.equal(admission.ok, true);
assert.equal(admission.action, "admit_post_repair_embodiment");

const envelope = compilePostRepairReleaseEnvelope({
  admission,
  active_branch: branch,
  live_head_sha: liveHead,
  envelope_id: `post-repair-release-envelope:${liveHead}`,
  spent_envelope_ids: [],
  required_evidence: [changedFile, executableArtifact, routingArtifact, proofArtifact],
});

assert.equal(envelope.ok, true);
assert.equal(envelope.action, "compile_post_repair_release_envelope");
assert.equal(envelope.envelope?.guard.require_next_status_head, "moved_head_only");
assert.deepEqual(envelope.blockers, []);
assert.ok(envelope.envelope?.guard.forbidden_progress_claims.includes("duplicate_repaired_head_readback"));
assert.ok(envelope.envelope?.guard.forbidden_progress_claims.includes("review_or_merge_without_moved_head_status"));

const stale = compilePostRepairReleaseEnvelope({
  admission,
  active_branch: branch,
  live_head_sha: "newer-live-head",
  envelope_id: "stale-envelope",
  spent_envelope_ids: [],
  required_evidence: [changedFile],
});

assert.equal(stale.ok, false);
assert.equal(stale.action, "block_stale_live_head");
assert.deepEqual(stale.blockers, [`post-repair admission head ${liveHead} is not live head newer-live-head`]);

const replay = compilePostRepairReleaseEnvelope({
  admission,
  active_branch: branch,
  live_head_sha: liveHead,
  envelope_id: `post-repair-release-envelope:${liveHead}`,
  spent_envelope_ids: [`post-repair-release-envelope:${liveHead}`],
  required_evidence: [changedFile],
});

assert.equal(replay.ok, false);
assert.equal(replay.action, "block_replayed_envelope");

const missingEvidence = compilePostRepairReleaseEnvelope({
  admission,
  active_branch: branch,
  live_head_sha: liveHead,
  envelope_id: "missing-proof-envelope",
  spent_envelope_ids: [],
  required_evidence: ["platform/packages/route-governor/src/not-present.ts"],
});

assert.equal(missingEvidence.ok, false);
assert.equal(missingEvidence.action, "block_missing_release_evidence");
assert.deepEqual(missingEvidence.blockers, [
  "post-repair release envelope missing evidence: platform/packages/route-governor/src/not-present.ts",
]);

console.log("post-repair release envelope proof passed");
