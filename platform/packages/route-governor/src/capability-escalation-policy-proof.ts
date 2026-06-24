import { applyCapabilityEscalationPolicy, type CapabilityEscalationCandidate } from "./capability-escalation-policy.js";

const branch = "monday-platform-genesis-01";
const head = "e2958542d55637b0351e313e00a5754b78119843";

function candidate(overrides: Partial<CapabilityEscalationCandidate> = {}): CapabilityEscalationCandidate {
  return {
    candidate_id: "capability-escalation-policy",
    branch,
    base_head_sha: head,
    move_class: "external_platform_embodiment",
    artifact_class: "capability_escalation_policy",
    capability_axis: "external_write",
    changed_files: ["platform/packages/route-governor/src/capability-escalation-policy.ts"],
    executable_artifacts: ["applyCapabilityEscalationPolicy"],
    routing_artifacts: ["capability axis floor must rise before another embodiment is admitted"],
    proof_artifacts: ["dist/capability-escalation-policy-proof.js"],
    compounds_axes: ["external_write", "runtime_execution"],
    ...overrides,
  };
}

const admitted = applyCapabilityEscalationPolicy({
  active_branch: branch,
  live_head_sha: head,
  current_axis_floor: "proof_surface",
  spent_move_classes: [],
  spent_artifact_classes: [],
  candidate: candidate(),
});
if (!admitted.ok || admitted.action !== "admit_escalated_embodiment") {
  throw new Error(`capability escalation should admit a higher-axis embodiment: ${admitted.blockers.join("; ")}`);
}

const stale = applyCapabilityEscalationPolicy({
  active_branch: branch,
  live_head_sha: head,
  current_axis_floor: "proof_surface",
  spent_move_classes: [],
  spent_artifact_classes: [],
  candidate: candidate({ base_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
});
if (stale.ok || stale.action !== "block_branch_or_head_mismatch") {
  throw new Error("capability escalation should reject stale repaired-head candidates");
}

const regression = applyCapabilityEscalationPolicy({
  active_branch: branch,
  live_head_sha: head,
  current_axis_floor: "external_write",
  spent_move_classes: [],
  spent_artifact_classes: [],
  candidate: candidate({ capability_axis: "proof_surface", compounds_axes: ["proof_surface", "source_routing"] }),
});
if (regression.ok || regression.action !== "block_axis_regression") {
  throw new Error("capability escalation should block lower-axis embodiment candidates");
}

console.log("capability escalation policy proof passed");
