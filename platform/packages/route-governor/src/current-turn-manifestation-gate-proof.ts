import {
  gateCurrentTurnManifestation,
  type CurrentTurnManifestationGateInput,
} from "./current-turn-manifestation-gate.js";

const liveHead = "738bdc3737aaedc567468b2317088a9b4a499945";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function baseInput(overrides: Partial<CurrentTurnManifestationGateInput> = {}): CurrentTurnManifestationGateInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    prompt_head_sha: repairedHead,
    last_status_readback_head_sha: "3bf8e07dce32e59accf776357fb22278f57ba3f5",
    resolved_historical_heads: [repairedHead],
    observations: [
      {
        surface_id: "pr-2-live-metadata",
        kind: "live_pr_metadata",
        branch: "monday-platform-genesis-01",
        head_sha: liveHead,
        evidence: [`PR #2 live head ${liveHead}`, "PR #2 open non-draft"],
      },
      {
        surface_id: "old-repaired-head-pr-body",
        kind: "pr_body_summary",
        branch: "monday-platform-genesis-01",
        head_sha: repairedHead,
        status_verdict: "passing",
        evidence: ["seven repaired-head checks succeeded before later branch movement"],
      },
    ],
    prohibited_move_classes: ["duplicate_ci_summary", "duplicate_comment", "local_memory_guard"],
    candidate: {
      move_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: liveHead,
      changed_files: ["platform/packages/route-governor/src/current-turn-manifestation-gate.ts"],
      executable_artifacts: ["gateCurrentTurnManifestation"],
      routing_artifacts: ["current turn manifestation gate"],
      proof_artifacts: ["platform/packages/route-governor/src/current-turn-manifestation-gate-proof.ts"],
    },
    ...overrides,
  };
}

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
}

function expectBlock(name: string, ok: boolean, blockers: string[], expected: string): void {
  if (ok) throw new Error(`${name} should block, but passed`);
  if (!blockers.some((blocker) => blocker.includes(expected))) {
    throw new Error(`${name} did not block for ${expected}; blockers: ${blockers.join("; ")}`);
  }
}

export function runCurrentTurnManifestationGateProof(): void {
  const embodiment = gateCurrentTurnManifestation(baseInput());
  expectOk("current-turn embodiment", embodiment.ok, embodiment.blockers);
  if (embodiment.action !== "admit_external_embodiment") {
    throw new Error(`unexpected current-turn embodiment action: ${embodiment.action}`);
  }
  if (!embodiment.quarantined_head_shas.includes(repairedHead)) {
    throw new Error("current-turn gate did not quarantine the repaired historical head");
  }

  const metadataOnly = gateCurrentTurnManifestation(
    baseInput({
      candidate: {
        ...baseInput().candidate,
        move_class: "pr_metadata_reread",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );
  expectBlock("metadata reread", metadataOnly.ok, metadataOnly.blockers, "pr_metadata_reread");

  const statusSummaryOnly = gateCurrentTurnManifestation(
    baseInput({
      candidate: {
        ...baseInput().candidate,
        move_class: "fresh_status_readback",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );
  expectBlock("summary-only status", statusSummaryOnly.ok, statusSummaryOnly.blockers, "summary surface cannot authorize");

  const directStatus = gateCurrentTurnManifestation(
    baseInput({
      observations: [
        ...baseInput().observations,
        {
          surface_id: "checks-live-head-738bdc",
          kind: "direct_status_surface",
          branch: "monday-platform-genesis-01",
          head_sha: liveHead,
          status_verdict: "passing_with_warnings",
          evidence: ["Route Governor Proof succeeded", "Node.js 20 notice is warning-only"],
        },
      ],
      candidate: {
        ...baseInput().candidate,
        move_class: "fresh_status_readback",
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );
  expectOk("direct live-head status", directStatus.ok, directStatus.blockers);
  if (directStatus.action !== "admit_fresh_status_readback") {
    throw new Error(`unexpected direct status action: ${directStatus.action}`);
  }
}
