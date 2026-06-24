import { compileProcessorLiveEmbodimentWorkOrder } from "./processor-live-embodiment-work-order.js";

const liveHead = "c867c2a27e4f3b160d6880d78aee73edd407ec0b";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const admitted = compileProcessorLiveEmbodimentWorkOrder({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  spent_semantic_signatures: ["duplicate-comment", "metadata-reread"],
  candidate: {
    candidate_id: "processor-live-work-order-001",
    branch: "monday-platform-genesis-01",
    base_head_sha: liveHead,
    semantic_signature: "processor-live-work-order",
    write_plan: [
      {
        path: "platform/packages/processor-fabric/src/processor-live-embodiment-work-order.ts",
        operation: "create",
        behavior_export: "compileProcessorLiveEmbodimentWorkOrder",
        routing_effect: "converts selected live-head workload into a guarded executable write order",
      },
      {
        path: "platform/packages/processor-fabric/src/processor-live-embodiment-work-order-proof.ts",
        operation: "create",
        behavior_export: "processorLiveEmbodimentWorkOrderProof",
        routing_effect: "proves stale-head, proof-only, and duplicate-signature rejection",
      },
    ],
    executable_artifacts: ["compileProcessorLiveEmbodimentWorkOrder"],
    routing_artifacts: ["live-head guarded work order"],
    proof_artifacts: ["processor-live-embodiment-work-order-proof"],
  },
});

assert(admitted.ok, `expected admitted work order: ${admitted.blockers.join("; ")}`);
assert(admitted.action === "compile_live_embodiment_work_order", `unexpected admitted action ${admitted.action}`);
assert(admitted.work_order?.guard.require_live_head_sha === liveHead, "work order must bind to live head");
assert(
  admitted.work_order?.guard.forbidden_progress_classes.includes("proof_only_change"),
  "work order must forbid proof-only release as embodiment",
);

const stale = compileProcessorLiveEmbodimentWorkOrder({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  spent_semantic_signatures: [],
  candidate: {
    candidate_id: "stale-work-order",
    branch: "monday-platform-genesis-01",
    base_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    semantic_signature: "stale-head-work-order",
    write_plan: [
      {
        path: "platform/packages/processor-fabric/src/stale.ts",
        operation: "create",
        behavior_export: "stale",
        routing_effect: "should not compile",
      },
    ],
    executable_artifacts: ["stale"],
    routing_artifacts: ["stale routing"],
    proof_artifacts: ["stale proof"],
  },
});

assert(!stale.ok, "stale work order must be blocked");
assert(stale.action === "block_stale_work_order_head", `unexpected stale action ${stale.action}`);

const proofOnly = compileProcessorLiveEmbodimentWorkOrder({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  spent_semantic_signatures: [],
  candidate: {
    candidate_id: "proof-only-work-order",
    branch: "monday-platform-genesis-01",
    base_head_sha: liveHead,
    semantic_signature: "proof-only-work-order",
    write_plan: [
      {
        path: "platform/packages/processor-fabric/src/proof-only-proof.ts",
        operation: "create",
        behavior_export: "proofOnlyProof",
        routing_effect: "should not count as embodiment",
      },
    ],
    executable_artifacts: ["proofOnlyProof"],
    routing_artifacts: ["proof-only routing"],
    proof_artifacts: ["proof-only proof"],
  },
});

assert(!proofOnly.ok, "proof-only work order must be blocked");
assert(proofOnly.action === "block_proof_only_work_order", `unexpected proof-only action ${proofOnly.action}`);

const duplicate = compileProcessorLiveEmbodimentWorkOrder({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  spent_semantic_signatures: ["already-spent"],
  candidate: {
    candidate_id: "duplicate-work-order",
    branch: "monday-platform-genesis-01",
    base_head_sha: liveHead,
    semantic_signature: "already-spent",
    write_plan: [
      {
        path: "platform/packages/processor-fabric/src/duplicate.ts",
        operation: "create",
        behavior_export: "duplicate",
        routing_effect: "should not compile",
      },
    ],
    executable_artifacts: ["duplicate"],
    routing_artifacts: ["duplicate routing"],
    proof_artifacts: ["duplicate proof"],
  },
});

assert(!duplicate.ok, "duplicate semantic signature must be blocked");
assert(duplicate.action === "block_duplicate_semantic_signature", `unexpected duplicate action ${duplicate.action}`);
