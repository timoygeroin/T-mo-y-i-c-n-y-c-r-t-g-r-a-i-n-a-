import {
  routeProcessorContinuationHandoff,
  type ProcessorContinuationHandoffInput,
  type ProcessorContinuationTargetReceipt,
} from "./processor-continuation-handoff.js";
import type { SourceAuthorizedConvergenceVerdict } from "./source-authorized-convergence.js";

const branch = "monday-platform-genesis-01";
const liveHead = "live-head";

function convergence(overrides: Partial<SourceAuthorizedConvergenceVerdict> = {}): SourceAuthorizedConvergenceVerdict {
  return {
    ok: true,
    action: "settle_source_authorized_external_act",
    scene_id: "loading-20-finalization",
    branch,
    head_sha: liveHead,
    accepted_output: "create processor-selected embodiment",
    authorized_outputs: ["authority-proof", "receipt-proof"],
    decisive_evidence: ["source-authorized processor convergence"],
    blockers: [],
    next_route: "release the source-authorized external act",
    ...overrides,
  };
}

function receipt(overrides: Partial<ProcessorContinuationTargetReceipt> = {}): ProcessorContinuationTargetReceipt {
  return {
    target_id: "processor-continuation-target-proof",
    target: "external_platform_embodiment",
    branch,
    base_head_sha: liveHead,
    changed_files: ["platform/packages/processor-fabric/src/processor-continuation-handoff.ts"],
    behavior_exports: ["routeProcessorContinuationHandoff"],
    routing_artifacts: ["processor convergence must become branch embodiment, moved-head status, or exact blocker"],
    proof_artifacts: ["platform/packages/processor-fabric/src/processor-continuation-handoff-proof.ts"],
    ...overrides,
  };
}

function base(overrides: Partial<ProcessorContinuationHandoffInput> = {}): ProcessorContinuationHandoffInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    handoff_id: "processor-continuation-handoff-proof",
    spent_handoff_ids: [],
    convergence: convergence(),
    target_receipt: receipt(),
    ...overrides,
  };
}

function expectAction(name: string, input: ProcessorContinuationHandoffInput, action: string, ok: boolean): void {
  const verdict = routeProcessorContinuationHandoff(input);
  if (verdict.action !== action || verdict.ok !== ok) {
    throw new Error(`${name} expected ${action}/${ok}, got ${verdict.action}/${verdict.ok}: ${verdict.blockers.join("; ")}`);
  }
}

export function runProcessorContinuationHandoffProof(): void {
  expectAction("external act handoff", base(), "handoff_processor_external_act", true);
  expectAction(
    "non-progress target",
    base({ target_receipt: receipt({ target: "metadata_reread" }) }),
    "block_non_progress_target",
    false,
  );
  expectAction(
    "stale convergence head",
    base({ convergence: convergence({ head_sha: "old-head" }) }),
    "block_wrong_head",
    false,
  );
  expectAction(
    "proof-only target",
    base({ target_receipt: receipt({ changed_files: ["platform/packages/processor-fabric/src/processor-continuation-handoff-proof.ts"] }) }),
    "block_incomplete_external_act",
    false,
  );
  expectAction(
    "processor exact blocker",
    base({
      convergence: convergence({
        action: "settle_source_authorized_exact_blocker",
        accepted_output: "GitHub rejected processor handoff write",
        blockers: ["GitHub rejected processor handoff write"],
      }),
      target_receipt: undefined,
    }),
    "require_processor_blocker_release",
    true,
  );
}

runProcessorContinuationHandoffProof();
