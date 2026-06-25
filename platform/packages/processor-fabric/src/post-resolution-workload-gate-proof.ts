import {
  admitPostResolutionProcessorWorkload,
  type PostResolutionProcessorWorkloadCandidate,
  type PostResolutionProcessorWorkloadGateInput,
} from "./post-resolution-workload-gate.js";

const branch = "monday-platform-genesis-01";
const resolvedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function candidate(overrides: Partial<PostResolutionProcessorWorkloadCandidate> = {}): PostResolutionProcessorWorkloadCandidate {
  return {
    workload_id: "post-resolution-workload-gate",
    workload_class: "external_platform_embodiment",
    branch,
    base_head_sha: resolvedHead,
    changed_files: ["platform/packages/processor-fabric/src/post-resolution-workload-gate.ts"],
    processor_loads: ["move-class-synthesis", "external-act-forcing"],
    required_outputs: ["one executable platform behavior increment"],
    executable_artifacts: ["admitPostResolutionProcessorWorkload"],
    routing_artifacts: ["post-resolution workload gate routes resolved repaired-head state into processor work"],
    proof_artifacts: ["platform/packages/processor-fabric/src/post-resolution-workload-gate-proof.ts"],
    ...overrides,
  };
}

function input(overrides: Partial<PostResolutionProcessorWorkloadGateInput> = {}): PostResolutionProcessorWorkloadGateInput {
  return {
    active_branch: branch,
    live_head_sha: resolvedHead,
    repaired_head_sha: resolvedHead,
    resolved_boundary_ids: ["issue-1-ci-status-readback", "repaired-head-checks-green"],
    spent_workload_ids: [],
    prohibited_workload_classes: [
      "metadata_reread",
      "duplicate_ci_summary",
      "duplicate_comment",
      "duplicate_label",
      "local_memory_guard",
      "guessed_future_ci",
      "reclose_resolved_blocker",
      "warning_maintenance",
    ],
    candidates: [candidate()],
    ...overrides,
  };
}

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
}

function expectFailure(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) throw new Error(`${name} should fail, but passed`);
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not fail for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

const admitted = admitPostResolutionProcessorWorkload(input());
expectOk("post-resolution processor workload", admitted.ok, admitted.blockers);
if (admitted.action !== "admit_post_resolution_processor_workload") {
  throw new Error(`expected admit_post_resolution_processor_workload, got ${admitted.action}`);
}
if (admitted.admitted?.workload_id !== "post-resolution-workload-gate") {
  throw new Error("gate did not admit the executable workload candidate");
}
if (admitted.quarantined_head_shas.includes(resolvedHead)) {
  throw new Error("resolved repaired head should not be quarantined while it is the live base for the next write");
}

const nonProgress = admitPostResolutionProcessorWorkload(
  input({
    candidates: [
      candidate({
        workload_id: "duplicate-ci-summary",
        workload_class: "duplicate_ci_summary",
        changed_files: [],
        processor_loads: [],
        required_outputs: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      }),
      candidate({
        workload_id: "warning-maintenance",
        workload_class: "warning_maintenance",
        changed_files: [],
        processor_loads: [],
        required_outputs: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      }),
    ],
  }),
);
expectFailure("non-progress workloads", nonProgress.ok, nonProgress.blockers, "no post-resolution processor workload");
if (!nonProgress.rejected.some((entry) => entry.reasons.some((reason) => reason.includes("duplicate_ci_summary")))) {
  throw new Error("duplicate CI summary was not rejected as non-progress");
}
if (!nonProgress.rejected.some((entry) => entry.reasons.some((reason) => reason.includes("warning_maintenance")))) {
  throw new Error("warning maintenance was not rejected as non-progress");
}

const staleBase = admitPostResolutionProcessorWorkload(
  input({
    live_head_sha: "new-live-head-after-write",
    candidates: [candidate({ base_head_sha: resolvedHead })],
  }),
);
expectFailure("stale workload base", staleBase.ok, staleBase.blockers, "no post-resolution processor workload");
if (!staleBase.quarantined_head_shas.includes(resolvedHead)) {
  throw new Error("stale repaired head was not quarantined after the live head moved");
}

const proofOnly = admitPostResolutionProcessorWorkload(
  input({
    candidates: [
      candidate({
        workload_id: "proof-only",
        changed_files: ["platform/packages/processor-fabric/src/post-resolution-workload-gate-proof.ts"],
      }),
    ],
  }),
);
expectFailure("proof-only workload", proofOnly.ok, proofOnly.blockers, "no post-resolution processor workload");
if (!proofOnly.rejected.some((entry) => entry.reasons.includes("candidate is proof-only and has no behavior file"))) {
  throw new Error("proof-only workload was not rejected");
}

const noBoundary = admitPostResolutionProcessorWorkload(input({ resolved_boundary_ids: [] }));
expectFailure("missing resolved boundary", noBoundary.ok, noBoundary.blockers, "no post-resolution processor workload");

const exactBlocker = "GitHub contents API rejected the live-head processor workload write";
const blocker = admitPostResolutionProcessorWorkload(
  input({
    candidates: [
      candidate({
        workload_id: "exact-blocker",
        workload_class: "exact_external_blocker",
        changed_files: [],
        processor_loads: [],
        required_outputs: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
        exact_blocker: exactBlocker,
      }),
    ],
  }),
);
expectOk("exact blocker workload", blocker.ok, blocker.blockers);
if (blocker.action !== "emit_post_resolution_exact_blocker") {
  throw new Error(`expected emit_post_resolution_exact_blocker, got ${blocker.action}`);
}
if (!blocker.blockers.includes(exactBlocker)) {
  throw new Error("exact blocker text was not preserved");
}
