import assert from "node:assert/strict";

import {
  compileEmbodimentSequence,
  type EmbodimentSequenceCandidate,
  type EmbodimentSequenceInput,
} from "./embodiment-sequence-compiler.js";

const branch = "monday-platform-genesis-01";
const liveHead = "ca76e917107865da59403d455e578c4924f4d8e0";
const previousStatusHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function candidate(overrides: Partial<EmbodimentSequenceCandidate> = {}): EmbodimentSequenceCandidate {
  return {
    sequence_id: "embodiment-sequence-compiler-01",
    move_class: "external_platform_embodiment",
    branch,
    base_head_sha: liveHead,
    artifact_class: "embodiment_sequence_compiler",
    changed_files: ["platform/packages/route-governor/src/embodiment-sequence-compiler.ts"],
    executable_artifacts: ["compileEmbodimentSequence"],
    routing_artifacts: ["sequence-level admission for live-head embodiment progress"],
    proof_artifacts: ["dist/embodiment-sequence-compiler-proof.js"],
    stage_evidence: [
      { stage: "current_surface_intake", evidence_ids: ["live PR metadata bound to current head"] },
      { stage: "terminal_progress_admission", evidence_ids: ["external platform embodiment selected"] },
      { stage: "route_progress_ledger", evidence_ids: ["route progress receipt required"] },
      { stage: "live_progress_receipt", evidence_ids: ["moved-head receipt required"] },
      { stage: "next_status_binding", evidence_ids: ["next readback must target resulting head"] },
    ],
    resulting_head_sha: "post-write-head",
    next_status_expected_head: "post-write-head",
    ...overrides,
  };
}

function input(overrides: Partial<EmbodimentSequenceInput> = {}): EmbodimentSequenceInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    previous_status_head_sha: previousStatusHead,
    prohibited_move_classes: ["duplicate_ci_summary", "metadata_reread"],
    spent_artifact_classes: ["warning_maintenance_router"],
    candidate: candidate(),
    ...overrides,
  };
}

const admitted = compileEmbodimentSequence(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_embodiment_sequence");
assert.equal(admitted.next_status_expected_head, "post-write-head");
assert.match(admitted.next_route, /do not count any individual stage as standalone progress/);

const staleBase = compileEmbodimentSequence(input({ candidate: candidate({ base_head_sha: previousStatusHead }) }));
assert.equal(staleBase.ok, false);
assert.equal(staleBase.action, "block_stale_base_head");

const missingStage = compileEmbodimentSequence(
  input({
    candidate: candidate({
      stage_evidence: candidate().stage_evidence.filter((stage) => stage.stage !== "live_progress_receipt"),
    }),
  }),
);
assert.equal(missingStage.ok, false);
assert.equal(missingStage.action, "block_incomplete_sequence");
assert.ok(missingStage.blockers.some((blocker) => blocker.includes("live_progress_receipt")));

const repeatedArtifact = compileEmbodimentSequence(
  input({
    spent_artifact_classes: ["embodiment_sequence_compiler"],
  }),
);
assert.equal(repeatedArtifact.ok, false);
assert.equal(repeatedArtifact.action, "block_replayed_artifact_class");

const statusReadbackWrappedAsEmbodiment = compileEmbodimentSequence(
  input({ candidate: candidate({ move_class: "fresh_status_readback" }) }),
);
assert.equal(statusReadbackWrappedAsEmbodiment.ok, false);
assert.equal(statusReadbackWrappedAsEmbodiment.action, "block_non_progress_move");

const unmovedResult = compileEmbodimentSequence(
  input({
    candidate: candidate({
      resulting_head_sha: liveHead,
      next_status_expected_head: liveHead,
    }),
  }),
);
assert.equal(unmovedResult.ok, false);
assert.equal(unmovedResult.action, "block_unmoved_result_head");

console.log("embodiment sequence compiler proof passed");
