import {
  routeAfterEmbodimentCommit,
  type PostEmbodimentNextRouteInput,
} from "./post-embodiment-next-route.js";

const BRANCH = "monday-platform-genesis-01";
const PREVIOUS_HEAD = "9ac69c2cdcd63405acdbb0ed8e7575708c467655";
const COMMITTED_HEAD = "c59c028641320ac90afd73c3d54e2975e4fbd91f";
const REPAIRED_HEAD = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function scenario(overrides: Partial<PostEmbodimentNextRouteInput> = {}): PostEmbodimentNextRouteInput {
  return {
    active_branch: BRANCH,
    previous_head_sha: PREVIOUS_HEAD,
    committed_head_sha: COMMITTED_HEAD,
    last_status_readback_head_sha: REPAIRED_HEAD,
    status_surfaces: [
      {
        surface_id: "repaired-head-success-summary",
        head_sha: REPAIRED_HEAD,
        verdict: "passing_with_warnings",
        evidence: ["historical repaired-head checks succeeded"],
      },
    ],
    candidate: {
      candidate_class: "fresh_status_readback",
      branch: BRANCH,
      base_head_sha: COMMITTED_HEAD,
    },
    ...overrides,
  };
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runPostEmbodimentNextRouteProof(): void {
  const requireReadback = routeAfterEmbodimentCommit(scenario());
  expect(requireReadback.ok, `expected new-head status requirement: ${requireReadback.blockers.join("; ")}`);
  expect(
    requireReadback.action === "require_new_head_status_readback",
    `unexpected readback action ${requireReadback.action}`,
  );
  expect(
    requireReadback.stale_status_surfaces.includes("repaired-head-success-summary"),
    "historical repaired-head status must be stale after embodiment commit",
  );

  const mergeBeforeStatus = routeAfterEmbodimentCommit(
    scenario({
      candidate: {
        candidate_class: "merge_attempt",
        branch: BRANCH,
        base_head_sha: COMMITTED_HEAD,
      },
    }),
  );
  expect(!mergeBeforeStatus.ok, "merge must be blocked until committed-head status is read");
  expect(mergeBeforeStatus.action === "block_status_gated_progress", `unexpected merge action ${mergeBeforeStatus.action}`);

  const secondEmbodimentBeforeStatus = routeAfterEmbodimentCommit(
    scenario({
      candidate: {
        candidate_class: "external_platform_embodiment",
        branch: BRANCH,
        base_head_sha: COMMITTED_HEAD,
      },
    }),
  );
  expect(!secondEmbodimentBeforeStatus.ok, "another embodiment must be blocked until committed-head status is read");
  expect(
    secondEmbodimentBeforeStatus.action === "block_status_gated_progress",
    `unexpected embodiment action ${secondEmbodimentBeforeStatus.action}`,
  );

  const liveStatus = routeAfterEmbodimentCommit(
    scenario({
      status_surfaces: [
        {
          surface_id: "committed-head-route-governor-proof",
          head_sha: COMMITTED_HEAD,
          verdict: "passing_with_warnings",
          evidence: ["Route Governor Proof completed for committed head"],
        },
      ],
    }),
  );
  expect(liveStatus.ok, `live committed-head status should pass: ${liveStatus.blockers.join("; ")}`);
  expect(liveStatus.action === "admit_head_bound_status_surface", `unexpected live status action ${liveStatus.action}`);
  expect(
    liveStatus.accepted_status_surfaces.includes("committed-head-route-governor-proof"),
    "committed-head status surface must be accepted",
  );

  const duplicateMemoryGuard = routeAfterEmbodimentCommit(
    scenario({
      candidate: {
        candidate_class: "local_memory_guard",
        branch: BRANCH,
        base_head_sha: COMMITTED_HEAD,
      },
    }),
  );
  expect(!duplicateMemoryGuard.ok, "local memory guard must not count as post-embodiment progress");
  expect(
    duplicateMemoryGuard.action === "block_repeated_non_progress",
    `unexpected duplicate action ${duplicateMemoryGuard.action}`,
  );

  const staleBase = routeAfterEmbodimentCommit(
    scenario({
      candidate: {
        candidate_class: "fresh_status_readback",
        branch: BRANCH,
        base_head_sha: PREVIOUS_HEAD,
      },
    }),
  );
  expect(!staleBase.ok, "post-embodiment candidate must be based on the committed head");
  expect(staleBase.action === "block_stale_candidate_base", `unexpected stale-base action ${staleBase.action}`);

  const exactBlocker = routeAfterEmbodimentCommit(
    scenario({
      candidate: {
        candidate_class: "exact_external_blocker",
        branch: BRANCH,
        base_head_sha: COMMITTED_HEAD,
        blocker: `COMMITTED_HEAD_STATUS_SURFACE_UNAVAILABLE: ${COMMITTED_HEAD}`,
      },
    }),
  );
  expect(exactBlocker.ok, `exact blocker should pass: ${exactBlocker.blockers.join("; ")}`);
  expect(exactBlocker.action === "emit_exact_external_blocker", `unexpected blocker action ${exactBlocker.action}`);
}

runPostEmbodimentNextRouteProof();
