import assert from "node:assert/strict";

import {
  admitStatuslessEmbodiment,
  type StatuslessEmbodimentAdmissionInput,
  type StatuslessEmbodimentCandidate,
} from "./statusless-embodiment-admission.js";

const branch = "monday-platform-genesis-01";
const promptHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "13999c8f3b8c3bd6d77c505d14570b15a2194f9b";

function candidate(overrides: Partial<StatuslessEmbodimentCandidate> = {}): StatuslessEmbodimentCandidate {
  return {
    candidate_id: "statusless-admission-proof",
    artifact_class: "statusless-embodiment-admission",
    changed_files: ["platform/packages/route-governor/src/statusless-embodiment-admission.ts"],
    executable_artifacts: ["admitStatuslessEmbodiment"],
    routing_artifacts: ["live-head supersedes prompt-head without pass/fail status claim"],
    proof_artifacts: ["dist/statusless-embodiment-admission-proof.js"],
    ...overrides,
  };
}

function input(overrides: Partial<StatuslessEmbodimentAdmissionInput> = {}): StatuslessEmbodimentAdmissionInput {
  return {
    branch,
    active_branch: branch,
    prompt_head_sha: promptHead,
    live_head_sha: liveHead,
    status_state: "absent",
    writable_external_surface: true,
    known_live_failures: [],
    pending_surfaces: [],
    spent_artifact_classes: [],
    prohibited_move_classes: ["metadata_reread", "duplicate_ci_summary", "old_repaired_head_blocker"],
    requested_move_class: "external_platform_embodiment",
    candidate: candidate(),
    ...overrides,
  };
}

const admitted = admitStatuslessEmbodiment(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_statusless_embodiment");
assert.equal(admitted.status_claim, "none");
assert.match(admitted.next_route, /new moved head/);

const staleStatus = admitStatuslessEmbodiment(input({ status_head_sha: promptHead }));
assert.equal(staleStatus.ok, false);
assert.equal(staleStatus.action, "require_live_status_readback");

const liveFailure = admitStatuslessEmbodiment(input({ status_state: "failing", known_live_failures: ["proof examples failed"] }));
assert.equal(liveFailure.ok, false);
assert.equal(liveFailure.action, "block_live_failure");

const boundStatus = admitStatuslessEmbodiment(input({ status_state: "passing", status_head_sha: liveHead }));
assert.equal(boundStatus.ok, true);
assert.equal(boundStatus.action, "continue_after_status");
assert.equal(boundStatus.status_claim, "bound_to_live_head");

const repeated = admitStatuslessEmbodiment(input({ spent_artifact_classes: ["statusless-embodiment-admission"] }));
assert.equal(repeated.ok, false);
assert.equal(repeated.action, "block_incomplete_candidate");
assert(repeated.blockers.some((blocker) => blocker.includes("repeats spent artifact class")));

console.log("statusless embodiment admission proof passed");
