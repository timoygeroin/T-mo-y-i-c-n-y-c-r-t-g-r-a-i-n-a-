import { intakeCurrentSurface, type CurrentSurfaceIntakeInput } from "./current-surface-intake.js";

const LIVE_HEAD = "2310e9719302f785cb01831acb2bcd50a5fcdce7";
const RESOLVED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function scenario(overrides: Partial<CurrentSurfaceIntakeInput> = {}): CurrentSurfaceIntakeInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: LIVE_HEAD,
    resolved_historical_heads: [RESOLVED_HEAD],
    observations: [
      {
        surface_id: "live-pr-metadata",
        kind: "live_pr_metadata",
        branch: "monday-platform-genesis-01",
        head_sha: LIVE_HEAD,
        evidence: [`live PR head ${LIVE_HEAD}`],
      },
      {
        surface_id: "prompt-resolved-head",
        kind: "prompt_carried_head",
        branch: "monday-platform-genesis-01",
        head_sha: RESOLVED_HEAD,
        evidence: [`resolved repaired head ${RESOLVED_HEAD}`],
      },
      {
        surface_id: "pr-body-stale-failure",
        kind: "pr_body_summary",
        branch: "monday-platform-genesis-01",
        head_sha: "df3a4035d6841ae19cc32443f0d4ef11449e65ac",
        status_verdict: "failing",
        evidence: ["stale PR body failure narrative"],
      },
    ],
    candidate: {
      move_class: "external_platform_embodiment",
      branch: "monday-platform-genesis-01",
      base_head_sha: LIVE_HEAD,
      changed_files: ["platform/packages/route-governor/src/current-surface-intake.ts"],
      executable_artifacts: ["intakeCurrentSurface"],
      routing_artifacts: ["current surface intake router"],
    },
    ...overrides,
  };
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runCurrentSurfaceIntakeProof(): void {
  const admitted = intakeCurrentSurface(scenario());
  expect(admitted.ok, `expected embodiment admission, got ${admitted.action}: ${admitted.blockers.join("; ")}`);
  expect(admitted.action === "admit_surface_bound_embodiment", `unexpected admission action ${admitted.action}`);
  expect(
    admitted.historical_surface_ids.includes("prompt-resolved-head"),
    "resolved repaired prompt head must be preserved only as historical context",
  );
  expect(
    admitted.quarantined_surface_ids.includes("pr-body-stale-failure"),
    "stale PR-body failure summary must be quarantined",
  );

  const staleCandidate = intakeCurrentSurface(
    scenario({
      candidate: {
        move_class: "external_platform_embodiment",
        branch: "monday-platform-genesis-01",
        base_head_sha: RESOLVED_HEAD,
        changed_files: ["platform/packages/route-governor/src/current-surface-intake.ts"],
        executable_artifacts: ["intakeCurrentSurface"],
        routing_artifacts: ["current surface intake router"],
      },
    }),
  );
  expect(!staleCandidate.ok, "stale repaired-head candidate must not pass");
  expect(staleCandidate.action === "block_stale_candidate_base", `unexpected stale action ${staleCandidate.action}`);

  const liveFailure = intakeCurrentSurface(
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
          evidence: ["live-head proof example failed"],
        },
      ],
    }),
  );
  expect(!liveFailure.ok, "live-head failure must route to repair instead of embodiment");
  expect(liveFailure.action === "route_to_live_failure_repair", `unexpected live failure action ${liveFailure.action}`);
}

runCurrentSurfaceIntakeProof();
