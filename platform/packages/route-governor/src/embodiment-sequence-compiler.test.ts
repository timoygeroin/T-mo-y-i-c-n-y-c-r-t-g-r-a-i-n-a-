import assert from "node:assert/strict";
import { test } from "node:test";

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

test("admits a complete live-head embodiment sequence", () => {
  const verdict = compileEmbodimentSequence(input());

  assert.equal(verdict.ok, true);
  assert.equal(verdict.action, "admit_embodiment_sequence");
  assert.equal(verdict.next_status_expected_head, "post-write-head");
  assert.deepEqual(verdict.blockers, []);
  assert.ok(verdict.sequence_steps.some((step) => step.includes("require the next status readback")));
  assert.ok(verdict.decisive_evidence.includes("prior status head expired b38ea247602ae8ebba80c4120ad03b41b26bd841"));
});

test("blocks candidates that are not based on the live PR head", () => {
  const verdict = compileEmbodimentSequence(input({ candidate: candidate({ base_head_sha: previousStatusHead }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_stale_base_head");
  assert.deepEqual(verdict.blockers, [`candidate base ${previousStatusHead} is not live head ${liveHead}`]);
});

test("requires every sequence stage before progress can be counted", () => {
  const verdict = compileEmbodimentSequence(
    input({
      candidate: candidate({
        stage_evidence: candidate().stage_evidence.filter((stage) => stage.stage !== "route_progress_ledger"),
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_incomplete_sequence");
  assert.ok(verdict.blockers.includes("embodiment sequence is missing stage evidence: route_progress_ledger"));
});

test("blocks non-progress move classes from being wrapped as embodiment", () => {
  const verdict = compileEmbodimentSequence(input({ candidate: candidate({ move_class: "metadata_reread" }) }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_non_progress_move");
});

test("blocks already spent artifact classes", () => {
  const verdict = compileEmbodimentSequence(input({ spent_artifact_classes: ["embodiment_sequence_compiler"] }));

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_replayed_artifact_class");
});

test("binds next status to the resulting head when a result is known", () => {
  const resultingHead = "93ed92e2bc62b0de289635c0aca37d8e3313206b";
  const verdict = compileEmbodimentSequence(
    input({
      candidate: candidate({
        resulting_head_sha: resultingHead,
        next_status_expected_head: resultingHead,
      }),
    }),
  );

  assert.equal(verdict.ok, true);
  assert.equal(verdict.next_status_expected_head, resultingHead);
});

test("blocks receipts that do not move beyond the live head", () => {
  const verdict = compileEmbodimentSequence(
    input({
      candidate: candidate({
        resulting_head_sha: liveHead,
        next_status_expected_head: liveHead,
      }),
    }),
  );

  assert.equal(verdict.ok, false);
  assert.equal(verdict.action, "block_unmoved_result_head");
});
