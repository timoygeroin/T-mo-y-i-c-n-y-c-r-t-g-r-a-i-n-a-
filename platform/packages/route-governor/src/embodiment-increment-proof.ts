import { selectEmbodimentIncrement, type EmbodimentIncrementCandidate, type PriorEmbodimentReceipt } from "./embodiment-increment.js";

const priorReceipts: PriorEmbodimentReceipt[] = [
  {
    receipt_id: "head-transition-lineage-guard",
    head_sha: "5b59cbd1d5ef1e1711ff93eb58d0d9e3672cead1",
    move_class: "external_platform_embodiment",
    artifact_class: "head_transition_lineage_guard",
    changed_files: ["platform/packages/route-governor/src/head-transition.ts"],
    executable_artifacts: ["compileHeadTransitionGuard"],
    routing_artifacts: ["latest-head lineage binding"],
  },
];

const candidates: EmbodimentIncrementCandidate[] = [
  {
    candidate_id: "duplicate-head-transition",
    branch: "monday-platform-genesis-01",
    current_head_sha: "candidate-head",
    move_class: "external_platform_embodiment",
    artifact_class: "head_transition_lineage_guard",
    changed_files: ["platform/packages/route-governor/src/head-transition.ts"],
    executable_artifacts: ["compileHeadTransitionGuard"],
    routing_artifacts: ["latest-head lineage binding"],
    prohibited_move_classes: ["metadata_reread", "duplicate_status_readback", "duplicate_comment", "internal_memory_guard"],
  },
  {
    candidate_id: "post-readback-embodiment-planner",
    branch: "monday-platform-genesis-01",
    current_head_sha: "candidate-head",
    move_class: "external_platform_embodiment",
    artifact_class: "post_readback_embodiment_planner",
    changed_files: ["platform/packages/route-governor/src/embodiment-increment.ts"],
    executable_artifacts: ["evaluateEmbodimentIncrement", "selectEmbodimentIncrement"],
    routing_artifacts: ["blocks repeated artifact classes before branch release"],
    prohibited_move_classes: ["metadata_reread", "duplicate_status_readback", "duplicate_comment", "internal_memory_guard"],
  },
];

const verdict = selectEmbodimentIncrement(candidates, priorReceipts);

if (!verdict.ok || !verdict.selected) {
  throw new Error(`embodiment increment proof failed: ${verdict.failures.join("; ")}`);
}

if (verdict.selected.candidate_id !== "post-readback-embodiment-planner") {
  throw new Error(`embodiment increment proof selected ${verdict.selected.candidate_id}`);
}

if (verdict.rejected.length !== 1) {
  throw new Error("embodiment increment proof did not reject the repeated artifact class");
}
