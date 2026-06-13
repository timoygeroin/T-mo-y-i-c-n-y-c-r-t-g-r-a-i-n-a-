import {
  reconcileScheduledSurface,
  type ScheduledSurfaceReconciliationInput,
} from "./scheduled-surface-reconciliation.js";

const LIVE_HEAD = "784bba3f0e40a5a75e4324f12742d1a5aa6ef5ae";
const REPAIRED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const BODY_FAILURE_HEAD = "df3a4035d6841ae19cc32443f0d4ef11449e65ac";

function scenario(overrides: Partial<ScheduledSurfaceReconciliationInput> = {}): ScheduledSurfaceReconciliationInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: LIVE_HEAD,
    scheduled_head_sha: REPAIRED_HEAD,
    last_status_readback_head_sha: REPAIRED_HEAD,
    resolved_historical_heads: [REPAIRED_HEAD],
    observations: [
      {
        surface_id: "live-pr-metadata",
        kind: "live_pr_metadata",
        branch: "monday-platform-genesis-01",
        head_sha: LIVE_HEAD,
        evidence: [`live PR head ${LIVE_HEAD}`],
      },
      {
        surface_id: "scheduled-prompt-head",
        kind: "scheduled_prompt",
        branch: "monday-platform-genesis-01",
        head_sha: REPAIRED_HEAD,
        evidence: [`scheduled prompt carried repaired head ${REPAIRED_HEAD}`],
      },
      {
        surface_id: "pr-body-current-head-failure-summary",
        kind: "pr_body_summary",
        branch: "monday-platform-genesis-01",
        head_sha: BODY_FAILURE_HEAD,
        status_verdict: "failing",
        evidence: ["PR body says an older moved head failed proof examples"],
      },
    ],
    candidate: {
      move_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: LIVE_HEAD,
      changed_files: [
        "platform/packages/route-governor/src/scheduled-surface-reconciliation.ts",
        "platform/packages/route-governor/src/scheduled-surface-reconciliation-proof.ts",
      ],
      executable_artifacts: ["reconcileScheduledSurface"],
      routing_artifacts: ["scheduled surface reconciliation gate"],
      proof_artifacts: ["scheduled-surface-reconciliation-proof"],
    },
    ...overrides,
  };
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runScheduledSurfaceReconciliationProof(): void {
  const admitted = reconcileScheduledSurface(scenario());
  expect(admitted.ok, `expected live-head embodiment admission: ${admitted.blockers.join("; ")}`);
  expect(admitted.action === "admit_live_head_embodiment", `unexpected action ${admitted.action}`);
  expect(
    admitted.historical_head_shas.includes(REPAIRED_HEAD),
    "scheduled repaired head must be preserved only as historical context",
  );
  expect(
    admitted.stale_surface_ids.includes("pr-body-current-head-failure-summary"),
    "PR-body failure summary for a non-live head must be stale",
  );
  expect(
    admitted.summary_surface_ids.includes("scheduled-prompt-head"),
    "scheduled prompt head must be classified as summary residue",
  );

  const staleCandidate = reconcileScheduledSurface(
    scenario({
      candidate: {
        move_class: "external_platform_embodiment",
        branch: "monday-platform-genesis-01",
        base_head_sha: REPAIRED_HEAD,
        changed_files: ["platform/packages/route-governor/src/scheduled-surface-reconciliation.ts"],
        executable_artifacts: ["reconcileScheduledSurface"],
        routing_artifacts: ["scheduled surface reconciliation gate"],
        proof_artifacts: ["scheduled-surface-reconciliation-proof"],
      },
    }),
  );
  expect(!staleCandidate.ok, "stale scheduled-head candidate must not pass");
  expect(staleCandidate.action === "block_stale_candidate_base", `unexpected stale action ${staleCandidate.action}`);

  const staleRepair = reconcileScheduledSurface(
    scenario({
      candidate: {
        move_class: "current_failure_repair",
        branch: "monday-platform-genesis-01",
        base_head_sha: LIVE_HEAD,
        changed_files: ["platform/packages/route-governor/src/scheduled-surface-reconciliation.ts"],
        executable_artifacts: ["reconcileScheduledSurface"],
        routing_artifacts: ["scheduled surface reconciliation gate"],
        proof_artifacts: ["scheduled-surface-reconciliation-proof"],
        failure_signature: "older proof examples failure",
      },
    }),
  );
  expect(!staleRepair.ok, "PR-body failure summary must not authorize live-head repair");
  expect(staleRepair.action === "block_stale_failure_repair", `unexpected stale repair action ${staleRepair.action}`);

  const liveRepair = reconcileScheduledSurface(
    scenario({
      observations: [
        {
          surface_id: "live-pr-metadata",
          kind: "live_pr_metadata",
          branch: "monday-platform-genesis-01",
          head_sha: LIVE_HEAD,
          evidence: [`live PR head ${LIVE_HEAD}`],
        },
        {
          surface_id: "live-status-failure",
          kind: "direct_status_surface",
          branch: "monday-platform-genesis-01",
          head_sha: LIVE_HEAD,
          status_verdict: "failing",
          evidence: ["live proof examples failed with assertion signature"],
        },
      ],
      candidate: {
        move_class: "current_failure_repair",
        branch: "monday-platform-genesis-01",
        base_head_sha: LIVE_HEAD,
        changed_files: ["platform/packages/route-governor/src/scheduled-surface-reconciliation.ts"],
        executable_artifacts: ["reconcileScheduledSurface"],
        routing_artifacts: ["scheduled surface reconciliation gate"],
        proof_artifacts: ["scheduled-surface-reconciliation-proof"],
        failure_signature: "live proof examples failed with assertion signature",
      },
    }),
  );
  expect(liveRepair.ok, `live failure repair should pass: ${liveRepair.blockers.join("; ")}`);
  expect(liveRepair.action === "admit_live_failure_repair", `unexpected live repair action ${liveRepair.action}`);

  const staleReadback = reconcileScheduledSurface(
    scenario({
      last_status_readback_head_sha: LIVE_HEAD,
      candidate: {
        move_class: "fresh_status_readback",
        branch: "monday-platform-genesis-01",
        base_head_sha: LIVE_HEAD,
        changed_files: [],
        executable_artifacts: [],
        routing_artifacts: [],
        proof_artifacts: [],
      },
    }),
  );
  expect(!staleReadback.ok, "scheduled status readback without head movement or live status must not pass");
  expect(staleReadback.action === "block_stale_status_readback", `unexpected readback action ${staleReadback.action}`);
}

runScheduledSurfaceReconciliationProof();
