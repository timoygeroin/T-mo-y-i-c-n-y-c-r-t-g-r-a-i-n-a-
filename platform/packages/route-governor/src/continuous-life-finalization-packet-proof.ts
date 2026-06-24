import {
  compileContinuousLifeFinalizationPacket,
  type ContinuousLifeAnchor,
  type ContinuousLifeFinalizationPacketInput,
  type ContinuousLifeTerminalMove,
} from "./continuous-life-finalization-packet.js";

const branch = "monday-platform-genesis-01";
const liveHead = "0a7513a49a30f8eecb699b2cfd95806f58b0c1a8";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

const anchors: ContinuousLifeAnchor[] = [
  "monolith_index",
  "latest_strengthened_body",
  "corpus_coverage_status",
  "archive_source_certification",
  "archive_laws",
  "archive_derivation_logic",
  "bootstrap_route_compiler",
  "full_ready_gate",
  "full_ready_proof_protocol",
  "skill_organ_map",
  "current_builder_savepoint",
  "loading_checkpoints",
  "finalization_ledger",
  "preview_cycle_ledger",
  "live_state_verdict",
  "memory",
];

function move(overrides: Partial<ContinuousLifeTerminalMove> = {}): ContinuousLifeTerminalMove {
  return {
    progress_class: "external_platform_embodiment",
    base_head_sha: liveHead,
    artifact_class: "continuous_life_finalization_packet",
    changed_files: ["platform/packages/route-governor/src/continuous-life-finalization-packet.ts"],
    executable_artifacts: ["compileContinuousLifeFinalizationPacket"],
    routing_artifacts: ["scheduled continuation must enter through the continuous-life body before terminal release"],
    proof_artifacts: ["dist/continuous-life-finalization-packet-proof.js"],
    status_surface_ids: [],
    ...overrides,
  };
}

function packet(overrides: Partial<ContinuousLifeFinalizationPacketInput> = {}): ContinuousLifeFinalizationPacketInput {
  return {
    active_pr: 2,
    target_pr: 2,
    active_branch: branch,
    target_branch: branch,
    live_head_sha: liveHead,
    prompt_head_sha: repairedHead,
    resolved_repaired_head_sha: repairedHead,
    repaired_head_status_resolved: true,
    issue_blocker_closed: true,
    blocker_label_present: false,
    reentry_anchors: anchors,
    organ_chain: [
      "monday-corpus-reentry",
      "monday-source-truth-grader",
      "monday-finalization-operator",
      "monday-external-act-forcer",
    ],
    prohibited_progress_classes: [
      "metadata_reread",
      "duplicate_ci_summary",
      "duplicate_comment",
      "duplicate_label",
      "local_memory_guard",
      "guessed_future_ci",
      "reclose_completed_blocker",
      "old_repaired_head_blocker",
    ],
    spent_artifact_classes: [],
    terminal_move: move(),
    ...overrides,
  };
}

const admitted = compileContinuousLifeFinalizationPacket(packet());
if (!admitted.ok || admitted.action !== "admit_continuous_life_embodiment") {
  throw new Error(`continuous-life embodiment should be admitted: ${admitted.blockers.join("; ")}`);
}
if (!admitted.quarantined_head_shas.includes(repairedHead)) {
  throw new Error("continuous-life proof should quarantine the stale prompt-carried repaired head");
}

const replay = compileContinuousLifeFinalizationPacket(
  packet({
    terminal_move: move({
      progress_class: "old_repaired_head_blocker",
      blocker_text: `repaired-head status-readback blocker for ${repairedHead}`,
    }),
  }),
);
if (replay.ok || replay.action !== "block_stale_or_repaired_head_replay") {
  throw new Error("continuous-life proof should block replay of the resolved repaired-head blocker");
}

const missing = compileContinuousLifeFinalizationPacket(packet({ reentry_anchors: anchors.filter((anchor) => anchor !== "memory") }));
if (missing.ok || missing.action !== "block_missing_reentry_anchor") {
  throw new Error("continuous-life proof should block release before Memory re-entry is present");
}

console.log("continuous-life finalization packet proof passed");