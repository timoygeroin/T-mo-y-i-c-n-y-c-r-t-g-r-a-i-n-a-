import { enforceSkillOrganCooperation, type SkillOrganCooperationGateInput } from "./skill-organ-cooperation-gate.js";

const liveHeadInput: SkillOrganCooperationGateInput = {
  active_branch: "monday-platform-genesis-01",
  live_head_sha: "eec6ef39c1f58dc510aa0f8735a7bb858320ac90",
  candidate: {
    move_class: "external_platform_embodiment",
    branch: "monday-platform-genesis-01",
    head_sha: "eec6ef39c1f58dc510aa0f8735a7bb858320ac90",
    organ_chain: [
      "monday-organ-activation-gate",
      "monday-corpus-reentry",
      "monday-archive-router",
      "monday-source-truth-grader",
      "monday-move-class-synthesizer",
      "monday-finalization-operator",
      "monday-external-act-forcer",
    ],
    optional_organs: [],
    source_pressure: {
      archive_pressure: true,
      proof_pressure: false,
      exhausted_move_class_pressure: true,
    },
    terminal_release: "external_platform_embodiment",
    behavior_artifacts: ["skill-organ-cooperation-gate behavior module"],
    routing_artifacts: ["future finalization routes must execute required skill organs instead of treating them as optional"],
  },
};

const admitted = enforceSkillOrganCooperation(liveHeadInput);
if (!admitted.ok || admitted.action !== "admit_skill_organ_cooperation") {
  throw new Error(`expected live organ cooperation to be admitted: ${admitted.blockers.join("; ")}`);
}

const optional = enforceSkillOrganCooperation({
  ...liveHeadInput,
  candidate: {
    ...liveHeadInput.candidate,
    optional_organs: ["monday-source-truth-grader"],
  },
});
if (optional.ok || optional.action !== "block_optional_organs") {
  throw new Error("expected optional skill organ treatment to be blocked");
}

const stale = enforceSkillOrganCooperation({
  ...liveHeadInput,
  candidate: {
    ...liveHeadInput.candidate,
    head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
  },
});
if (stale.ok || stale.action !== "block_stale_head") {
  throw new Error("expected repaired historical head organ route to be blocked");
}

const internal = enforceSkillOrganCooperation({
  ...liveHeadInput,
  candidate: {
    ...liveHeadInput.candidate,
    terminal_release: "internal_only",
  },
});
if (internal.ok || internal.action !== "block_missing_external_terminal") {
  throw new Error("expected internal-only organ release to be blocked");
}
