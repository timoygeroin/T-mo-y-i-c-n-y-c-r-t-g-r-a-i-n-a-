import { reconcileLiveHeadEmbodimentChoice, type ChoiceHeadSource, type LiveHeadChoiceInput } from "./live-head-choice-reconciliation.js";
import type { EmbodimentChoiceCandidate } from "./embodiment-choice-kernel.js";

const branch = "monday-platform-genesis-01";
const liveHead = "751e9de6193f46bd852604e3d1eda5ebd2b30d82";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const olderFailedHead = "1a0c8f200c4050ddb944284b7fd253ffc0b761dc";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function source(overrides: Partial<ChoiceHeadSource> = {}): ChoiceHeadSource {
  return {
    source_id: "live-pr-metadata",
    kind: "live_pr_metadata",
    head_sha: liveHead,
    evidence: [`GitHub PR metadata reports live head ${liveHead}`],
    ...overrides,
  };
}

function candidate(overrides: Partial<EmbodimentChoiceCandidate> = {}): EmbodimentChoiceCandidate {
  return {
    candidate_id: "live-head-choice-reconciliation-proof-chain",
    changed_files: [
      "platform/packages/route-governor/src/live-head-choice-reconciliation.ts",
      "platform/packages/route-governor/src/live-head-choice-reconciliation-proof.ts",
    ],
    executable_exports: ["reconcileLiveHeadEmbodimentChoice"],
    proof_artifacts: ["dist/live-head-choice-reconciliation-proof.js"],
    routing_effects: ["retire stale prompt and PR-body head sources before selecting external embodiment"],
    choice_classes: ["runtime_behavior", "future_routing", "proof_surface"],
    ...overrides,
  };
}

function input(overrides: Partial<LiveHeadChoiceInput> = {}): LiveHeadChoiceInput {
  return {
    branch,
    active_branch: branch,
    live_head_sha: liveHead,
    last_repaired_head_sha: repairedHead,
    exhausted_move_classes: [
      "metadata_reread",
      "duplicate_ci_summary",
      "duplicate_comment",
      "internal_memory_guard",
      "warning_repair",
    ],
    sources: [
      source({
        source_id: "prompt-repaired-head-success",
        kind: "prompt",
        head_sha: repairedHead,
        status: "passing_with_warnings",
        evidence: ["prompt says repaired head checks succeeded"],
      }),
      source({
        source_id: "pr-body-older-failure",
        kind: "pr_body_summary",
        head_sha: olderFailedHead,
        status: "failing",
        evidence: ["PR body still exposes an older public checks failure"],
      }),
      source(),
    ],
    candidates: [
      candidate({
        candidate_id: "metadata-reread-repeat",
        changed_files: [],
        executable_exports: [],
        proof_artifacts: [],
        routing_effects: [],
        choice_classes: ["metadata_only"],
        repeats_move_class: "metadata_reread",
      }),
      candidate(),
    ],
    ...overrides,
  };
}

export function runLiveHeadChoiceReconciliationProof(): void {
  const selected = reconcileLiveHeadEmbodimentChoice(input());
  assert(selected.ok, `live-head choice should select executable embodiment: ${selected.blockers.join("; ")}`);
  assert(selected.action === "select_executable_embodiment", `expected select_executable_embodiment, got ${selected.action}`);
  assert(selected.selected_candidate_id === "live-head-choice-reconciliation-proof-chain", "expected proof-chain candidate to be selected");
  assert(
    selected.stale_source_ids.includes("prompt-repaired-head-success") &&
      selected.stale_source_ids.includes("pr-body-older-failure"),
    "stale prompt and PR-body sources must be retired before choice",
  );

  const failing = reconcileLiveHeadEmbodimentChoice(
    input({
      sources: [
        source(),
        source({
          source_id: "live-actions-failure",
          kind: "actions_readback",
          head_sha: liveHead,
          status: "failing",
          evidence: ["live-head proof examples failed"],
        }),
      ],
    }),
  );
  assert(!failing.ok, "live-head failure must block embodiment selection");
  assert(failing.action === "repair_live_head_failure", `expected repair_live_head_failure, got ${failing.action}`);

  const noCandidate = reconcileLiveHeadEmbodimentChoice(
    input({
      candidates: [
        candidate({
          candidate_id: "duplicate-comment-only",
          changed_files: [],
          executable_exports: [],
          proof_artifacts: [],
          routing_effects: [],
          choice_classes: ["commentary_only"],
          repeats_move_class: "duplicate_comment",
        }),
      ],
    }),
  );
  assert(!noCandidate.ok, "non-executable candidates must not survive live-head choice");
  assert(noCandidate.action === "block_no_candidate", `expected block_no_candidate, got ${noCandidate.action}`);
}

runLiveHeadChoiceReconciliationProof();
