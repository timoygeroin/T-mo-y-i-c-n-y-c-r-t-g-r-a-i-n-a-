import assert from "node:assert/strict";

import {
  admitProcessorLoadIntake,
  type ProcessorLoadIntakeCandidate,
  type ProcessorLoadIntakeInput,
} from "./processor-load-intake.js";

const branch = "monday-platform-genesis-01";
const liveHead = "b433a3ef6bdc3d0e31826a762ed3b87ba727e86d";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function candidate(overrides: Partial<ProcessorLoadIntakeCandidate> = {}): ProcessorLoadIntakeCandidate {
  return {
    load_id: "external-act-load",
    branch,
    head_sha: liveHead,
    class: "external_act_forcing",
    source_tier: "direct_current_instruction",
    required_output: "proof_pressure",
    evidence: ["current scheduled finalization instruction", "platform/packages/processor-fabric/src/processor-load-intake.ts"],
    semantic_signature: "processor-load-intake:live-head:external-act-forcing",
    ...overrides,
  };
}

function input(overrides: Partial<ProcessorLoadIntakeInput> = {}): ProcessorLoadIntakeInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    scene_id: "loading-20-finalization",
    max_processors: 3,
    convergence_rule: "collapse to one external embodiment or exact blocker",
    spent_load_ids: [],
    spent_semantic_signatures: [],
    candidates: [
      candidate({
        load_id: "truth-load",
        class: "source_truth_grading",
        source_tier: "archive_derived",
        required_output: "route_attack",
        evidence: ["agent_files/docs/monday-archive-source-certification.md"],
        semantic_signature: "processor-load-intake:archive-derived:truth-load",
      }),
      candidate(),
    ],
    ...overrides,
  };
}

const admitted = admitProcessorLoadIntake(input());
assert.equal(admitted.ok, true);
assert.equal(admitted.action, "admit_processor_loads");
assert.equal(admitted.loads.length, 2);
assert.deepEqual(admitted.blockers, []);
assert.ok(admitted.decisive_evidence.includes("current scheduled finalization instruction"));

const staleHead = admitProcessorLoadIntake(input({ candidates: [candidate({ head_sha: repairedHead })] }));
assert.equal(staleHead.ok, false);
assert.equal(staleHead.action, "block_wrong_head");
assert.ok(staleHead.blockers.some((blocker) => blocker.includes("does not match live head")));

const summaryOnly = admitProcessorLoadIntake(
  input({
    candidates: [
      candidate({
        source_tier: "model_summary",
        evidence: ["prior synthesized report"],
        semantic_signature: "processor-load-intake:model-summary-only",
      }),
    ],
  }),
);
assert.equal(summaryOnly.ok, false);
assert.equal(summaryOnly.action, "block_model_summary_only");

const analysisOnly = admitProcessorLoadIntake(
  input({
    candidates: [
      candidate({
        load_id: "truth-load",
        class: "source_truth_grading",
        source_tier: "direct_archive",
        required_output: "route_attack",
        evidence: ["agent_files/docs/monday-archive-laws.md"],
        semantic_signature: "processor-load-intake:truth-only",
      }),
    ],
  }),
);
assert.equal(analysisOnly.ok, false);
assert.equal(analysisOnly.action, "block_missing_act_forcing_load");

const overBudget = admitProcessorLoadIntake(
  input({
    max_processors: 1,
    candidates: [
      candidate({ load_id: "one", semantic_signature: "processor-load-intake:one" }),
      candidate({ load_id: "two", semantic_signature: "processor-load-intake:two" }),
    ],
  }),
);
assert.equal(overBudget.ok, false);
assert.equal(overBudget.action, "block_unbounded_load_set");

const reused = admitProcessorLoadIntake(
  input({
    spent_semantic_signatures: ["processor-load-intake:live-head:external-act-forcing"],
    candidates: [candidate()],
  }),
);
assert.equal(reused.ok, false);
assert.equal(reused.action, "block_reused_load");

const noEvidence = admitProcessorLoadIntake(input({ candidates: [candidate({ evidence: [] })] }));
assert.equal(noEvidence.ok, false);
assert.equal(noEvidence.action, "block_missing_evidence");
