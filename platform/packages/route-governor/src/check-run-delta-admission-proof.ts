import {
  admitCheckRunDelta,
  type CheckRunDeltaAdmissionInput,
} from "./check-run-delta-admission.js";

const LIVE_HEAD = "655a01e25e215b4daf52c5e291865b0f296464a1";
const REPAIRED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function scenario(overrides: Partial<CheckRunDeltaAdmissionInput> = {}): CheckRunDeltaAdmissionInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: LIVE_HEAD,
    previous_status_head_sha: REPAIRED_HEAD,
    spent_run_ids: ["27049650678", "27049651467"],
    direct_surfaces: [
      {
        surface_id: "current-head-route-governor-proof",
        kind: "workflow_run",
        branch: "monday-platform-genesis-01",
        head_sha: LIVE_HEAD,
        run_id: "30000000001",
        verdict: "passing_with_warnings",
        evidence: ["current-head Route Governor Proof run succeeded"],
        warnings: ["Node.js 20 Actions deprecation notice remains non-blocking"],
      },
    ],
    summary_surfaces: [
      {
        surface_id: "repaired-head-prompt-summary",
        branch: "monday-platform-genesis-01",
        head_sha: REPAIRED_HEAD,
        evidence: ["older repaired-head success summary from prompt"],
      },
    ],
    ...overrides,
  };
}

export function runCheckRunDeltaAdmissionProof(): void {
  const admitted = admitCheckRunDelta(scenario());
  expect(admitted.ok, `fresh current-head delta should pass: ${admitted.blockers.join("; ")}`);
  expect(admitted.action === "admit_fresh_status_delta", `unexpected action ${admitted.action}`);
  expect(admitted.admitted_run_ids.includes("30000000001"), "fresh run id must be admitted");
  expect(
    admitted.summary_surface_ids.includes("repaired-head-prompt-summary"),
    "prompt-carried repaired-head summary must stay summary-only",
  );

  const replay = admitCheckRunDelta(scenario({ spent_run_ids: ["30000000001"] }));
  expect(!replay.ok, "replayed live-head run id must not count as fresh status");
  expect(replay.action === "block_no_fresh_delta", `unexpected replay action ${replay.action}`);

  const stale = admitCheckRunDelta(
    scenario({
      direct_surfaces: [
        {
          surface_id: "old-repaired-head-route-governor-proof",
          kind: "workflow_run",
          branch: "monday-platform-genesis-01",
          head_sha: REPAIRED_HEAD,
          run_id: "27049650678",
          verdict: "passing",
          evidence: ["old repaired-head proof run succeeded"],
          warnings: [],
        },
      ],
    }),
  );
  expect(!stale.ok, "old repaired-head run must not authorize live-head status");
  expect(stale.action === "block_stale_delta_head", `unexpected stale action ${stale.action}`);

  const failing = admitCheckRunDelta(
    scenario({
      direct_surfaces: [
        {
          surface_id: "current-head-proof-failure",
          kind: "workflow_run",
          branch: "monday-platform-genesis-01",
          head_sha: LIVE_HEAD,
          run_id: "30000000002",
          verdict: "failing",
          evidence: ["current-head proof examples failed"],
          warnings: [],
        },
      ],
    }),
  );
  expect(!failing.ok, "fresh failing delta should route to repair, not status success");
  expect(failing.action === "route_live_failure_delta", `unexpected failing action ${failing.action}`);
}

runCheckRunDeltaAdmissionProof();
