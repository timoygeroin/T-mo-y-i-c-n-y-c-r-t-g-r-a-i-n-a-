import { containProofChainFailure, type ProofChainFailureContainmentInput } from "./proof-chain-failure-containment.js";

const branch = "monday-platform-genesis-01";
const liveHead = "4d3cb5f972ee02f97f4f94ebf418e73c59b1a186";

function input(overrides: Partial<ProofChainFailureContainmentInput> = {}): ProofChainFailureContainmentInput {
  return {
    branch,
    active_branch: branch,
    live_head_sha: liveHead,
    status_head_sha: liveHead,
    status_state: "failing",
    failing_check_name: "Monday Platform CI / Route governor proof surface",
    failing_step: "Run proof examples",
    spent_artifact_classes: [],
    candidate: {
      candidate_id: "proof-chain-containment",
      intent: "failure_detail_containment",
      artifact_class: "proof_chain_failure_containment",
      changed_files: ["platform/packages/route-governor/src/proof-chain-failure-containment.ts"],
      executable_artifacts: ["containProofChainFailure"],
      routing_artifacts: ["proof-chain failure containment gate"],
      proof_artifacts: ["platform/packages/route-governor/src/proof-chain-failure-containment-proof.ts"],
      appends_proof_command: false,
      claims_repair: false,
    },
    ...overrides,
  };
}

function assertAction(name: string, actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`${name} expected ${expected}, received ${actual}`);
  }
}

function runProofChainFailureContainmentProof(): void {
  const headlineOnlyFailure = containProofChainFailure(input());
  assertAction("headline-only proof failure", headlineOnlyFailure.action, "allow_containment_increment");
  if (!headlineOnlyFailure.ok) {
    throw new Error(`headline-only proof failure should admit containment: ${headlineOnlyFailure.blockers.join("; ")}`);
  }

  const prematureRepair = containProofChainFailure(
    input({
      candidate: {
        ...input().candidate!,
        candidate_id: "premature-repair",
        intent: "repair_current_failure",
        artifact_class: "premature_repair_claim",
        claims_repair: true,
      },
    }),
  );
  assertAction("premature repair", prematureRepair.action, "block_missing_failure_detail");
  if (prematureRepair.ok) {
    throw new Error("premature repair should not pass without actionable failure detail");
  }

  const actionableRepair = containProofChainFailure(
    input({
      actionable_failure_detail: "AssertionError: proof chain expected containment before extension",
      candidate: {
        ...input().candidate!,
        candidate_id: "bounded-repair",
        intent: "repair_current_failure",
        artifact_class: "bounded_current_head_repair",
        changed_files: ["platform/packages/route-governor/src/proof-chain.ts"],
        executable_artifacts: ["compileProofChain"],
        routing_artifacts: ["bounded current-head repair"],
        proof_artifacts: ["platform/packages/route-governor/src/proof-chain-proof.ts"],
        claims_repair: true,
      },
    }),
  );
  assertAction("actionable repair", actionableRepair.action, "allow_repair_from_detail");
  if (!actionableRepair.ok) {
    throw new Error(`actionable repair should pass: ${actionableRepair.blockers.join("; ")}`);
  }

  const staleStatus = containProofChainFailure(
    input({
      status_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    }),
  );
  assertAction("stale repaired-head status", staleStatus.action, "block_stale_status");
  if (staleStatus.ok) {
    throw new Error("stale repaired-head status should not unlock containment or repair");
  }
}

runProofChainFailureContainmentProof();
