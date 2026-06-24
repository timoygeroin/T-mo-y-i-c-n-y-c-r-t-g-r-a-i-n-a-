import assert from "node:assert/strict";
import { test } from "node:test";

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
    candidate_id: "statusless-admission",
    artifact_class: "statusless-embodiment-admission",
    changed_files: ["platform/packages/route-governor/src/statusless-embodiment-admission.ts"],
    executable_artifacts: ["admitStatuslessEmbodiment"],
    routing_artifacts: ["no-status-claim branch write admission"],
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

test("admits statusless embodiment when live head supersedes prompt head and no status is claimed", () => {
  const verdict = admitStatuslessEmbodiment(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_statusless_embodiment");
  assert.equal(verdict.status_claim, "none");
  assert.deepEqual(verdict.blockers, []);
  assert.match(verdict.decisive_evidence.join("\n"), /supersedes prompt head/);
  assert.match(verdict.next_route, /bind status readback to the new moved head/);
});

test("continues after live-head status when status is already bound", () => {
  const verdict = admitStatuslessEmbodiment(
    input({
      status_state: "passing_with_warnings",
      status_head_sha: liveHead,
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "continue_after_status");
  assert.equal(verdict.status_claim, "bound_to_live_head");
});

test("blocks live-head failure before statusless embodiment", () => {
  const verdict = admitStatuslessEmbodiment(
    input({
      status_state: "failing",
      known_live_failures: ["Route Governor Proof / proof examples failed"],
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_live_failure");
  assert.deepEqual(verdict.blockers, ["Route Governor Proof / proof examples failed"]);
});

test("blocks pending live-head checks before no-status-claim branch write", () => {
  const verdict = admitStatuslessEmbodiment(input({ status_state: "pending", pending_surfaces: ["Route Governor Proof pending"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_pending_status");
  assert.deepEqual(verdict.blockers, ["Route Governor Proof pending"]);
});

test("requires readback when the attached status belongs to an older head", () => {
  const verdict = admitStatuslessEmbodiment(input({ status_head_sha: promptHead }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "require_live_status_readback");
  assert.deepEqual(verdict.blockers, [`attached status belongs to ${promptHead}, not live head ${liveHead}`]);
});

test("blocks incomplete candidates without executable platform changes", () => {
  const verdict = admitStatuslessEmbodiment(input({ candidate: candidate({ changed_files: ["platform/docs/manifestation-contract.md"] }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_candidate");
  assert(verdict.blockers.includes("statusless embodiment candidate does not change executable platform files"));
});

test("requires live status when the prompt head is still live", () => {
  const verdict = admitStatuslessEmbodiment(input({ prompt_head_sha: liveHead }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "require_live_status_readback");
  assert.deepEqual(verdict.blockers, [`prompt head is still live at ${liveHead}; no head movement justifies statusless admission`]);
});

test("blocks prohibited repeated move classes", () => {
  const verdict = admitStatuslessEmbodiment(input({ requested_move_class: "duplicate_ci_summary" }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_candidate");
  assert.deepEqual(verdict.blockers, ["statusless embodiment requested prohibited move class: duplicate_ci_summary"]);
});
