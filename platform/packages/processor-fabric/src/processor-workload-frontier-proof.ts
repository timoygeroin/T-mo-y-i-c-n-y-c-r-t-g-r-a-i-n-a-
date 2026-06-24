import {
  compileProcessorWorkloadFrontier,
  type ProcessorWorkloadCandidate,
  type ProcessorWorkloadFrontierInput,
} from "./processor-workload-frontier.js";

const branch = "monday-platform-genesis-01";
const liveHead = "live-head";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function candidate(overrides: Partial<ProcessorWorkloadCandidate> = {}): ProcessorWorkloadCandidate {
  return {
    candidate_id: "reentry-load",
    branch,
    base_head_sha: liveHead,
    load_class: "corpus_reentry",
    source_tier: "direct_current_instruction",
    required_output: "ledger_delta",
    estimated_processors: 1,
    semantic_signature: "corpus-reentry-live-head",
    evidence: ["direct current instruction requires Loading 20 reentry"],
    ...overrides,
  };
}

function input(overrides: Partial<ProcessorWorkloadFrontierInput> = {}): ProcessorWorkloadFrontierInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    prompt_head_sha: repairedHead,
    repaired_head_sha: repairedHead,
    frontier_id: "processor-workload-frontier-proof",
    spent_frontier_ids: [],
    spent_semantic_signatures: [],
    max_processors: 4,
    required_load_classes: ["corpus_reentry", "source_truth_grading", "embodiment_candidate", "external_act_forcing"],
    candidates: [
      candidate(),
      candidate({
        candidate_id: "truth-load",
        load_class: "source_truth_grading",
        source_tier: "archive_derived",
        required_output: "route_attack",
        semantic_signature: "source-truth-live-head",
        evidence: ["archive-derived source truth grading is required before branch write"],
      }),
      candidate({
        candidate_id: "candidate-load",
        load_class: "embodiment_candidate",
        source_tier: "memory",
        required_output: "candidate_mechanism",
        semantic_signature: "embodiment-candidate-live-head",
        evidence: ["memory anti-repeat ledger requires non-repeated embodiment candidate"],
      }),
      candidate({
        candidate_id: "act-load",
        load_class: "external_act_forcing",
        source_tier: "direct_current_instruction",
        required_output: "external_act",
        semantic_signature: "external-act-live-head",
        evidence: ["direct current instruction permits only external act or exact blocker"],
      }),
    ],
    ...overrides,
  };
}

function expectAction(name: string, value: ProcessorWorkloadFrontierInput, action: string, ok: boolean): void {
  const verdict = compileProcessorWorkloadFrontier(value);
  if (verdict.action !== action || verdict.ok !== ok) {
    throw new Error(`${name} expected ${action}/${ok}, got ${verdict.action}/${verdict.ok}: ${verdict.blockers.join("; ")}`);
  }
}

export function runProcessorWorkloadFrontierProof(): void {
  expectAction("selects bounded live-head workload", input(), "select_processor_workload_frontier", true);

  expectAction(
    "blocks stale workload head",
    input({ candidates: [candidate({ base_head_sha: repairedHead })] }),
    "block_no_selectable_workload",
    false,
  );

  expectAction(
    "blocks non-progress workload class",
    input({ candidates: [candidate({ load_class: "metadata_reread" })] }),
    "block_no_selectable_workload",
    false,
  );

  expectAction(
    "blocks unbounded budget",
    input({ max_processors: 0 }),
    "block_unbounded_budget",
    false,
  );

  expectAction(
    "settles exact blocker when required workload is absent",
    input({
      required_load_classes: ["corpus_reentry", "embodiment_candidate"],
      candidates: [
        candidate(),
        candidate({
          candidate_id: "exact-blocker-load",
          load_class: "exact_external_blocker",
          required_output: "exact_blocker",
          semantic_signature: "exact-blocker-live-head",
          blocker: "no behavior-bearing processor workload candidate is available for embodiment_candidate",
          evidence: ["processor frontier exact blocker evidence"],
        }),
      ],
    }),
    "settle_frontier_exact_blocker",
    true,
  );
}

runProcessorWorkloadFrontierProof();
