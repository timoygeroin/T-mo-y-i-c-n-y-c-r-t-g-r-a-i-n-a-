import { routeReadbackAccess, type ReadbackAccessInput } from "./readback-access-boundary.js";

const liveHead = "52d01d2288025ed6f357bbd94a33a1407dfa404b";

function input(overrides: Partial<ReadbackAccessInput> = {}): ReadbackAccessInput {
  return {
    head_sha: liveHead,
    requested_readback_head_sha: liveHead,
    available_sources: ["pr_metadata", "commit_diff"],
    status_surface_ids: [],
    fallback_embodiment_available: false,
    ...overrides,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

export function runReadbackAccessBoundaryProof(): void {
  const statusReady = routeReadbackAccess(
    input({
      available_sources: ["github_checks_api", "actions_runs_api"],
      status_surface_ids: ["check-run-27049651460", "workflow-run-27049651467"],
    }),
  );
  assert(statusReady.ok, "live-head status source plus surface ids should allow readback publication");
  assert(
    statusReady.action === "publish_live_head_readback",
    `expected publish_live_head_readback, got ${statusReady.action}`,
  );

  const staleHead = routeReadbackAccess(
    input({ requested_readback_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841" }),
  );
  assert(!staleHead.ok, "readback must reject a requested head that is not live");
  assert(
    staleHead.blockers.some((blocker) => blocker.includes("does not match live head")),
    "stale head blocker must name the live-head mismatch",
  );

  const nonStatusEvidence = routeReadbackAccess(input());
  assert(!nonStatusEvidence.ok, "PR metadata and commit diff alone must not prove status");
  assert(
    nonStatusEvidence.blockers.includes("PR metadata and commit diff do not prove Checks or Actions status"),
    "non-status evidence blocker must be explicit",
  );

  const inaccessibleStatusSurface = routeReadbackAccess(
    input({
      available_sources: ["missing_cli", "public_rest_blocked"],
      blocker_text: "Checks/Actions status surface is inaccessible from the current runtime",
    }),
  );
  assert(!inaccessibleStatusSurface.ok, "missing CLI plus blocked REST must block status claims");
  assert(
    inaccessibleStatusSurface.blockers.includes("GitHub CLI is unavailable in the runtime"),
    "missing CLI blocker must survive",
  );
  assert(
    inaccessibleStatusSurface.blockers.includes("public GitHub REST status endpoints returned 403"),
    "blocked REST blocker must survive",
  );

  const fallbackEmbodiment = routeReadbackAccess(
    input({
      available_sources: ["missing_cli", "public_rest_blocked"],
      fallback_embodiment_available: true,
    }),
  );
  assert(fallbackEmbodiment.ok, "status-access failure should route to embodiment when a non-repeated embodiment exists");
  assert(
    fallbackEmbodiment.action === "route_to_executable_embodiment",
    `expected route_to_executable_embodiment, got ${fallbackEmbodiment.action}`,
  );
}

runReadbackAccessBoundaryProof();
