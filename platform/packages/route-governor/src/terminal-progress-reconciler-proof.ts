import {
  reconcileTerminalProgress,
  type TerminalProgressReconcilerInput,
  type TerminalProgressSurface,
} from "./terminal-progress-reconciler.js";

const branch = "monday-platform-genesis-01";
const liveHead = "terminal-progress-live-head";

function surface(overrides: Partial<TerminalProgressSurface> = {}): TerminalProgressSurface {
  return {
    surface_id: "current-turn-gate",
    kind: "current_turn_gate",
    branch,
    head_sha: liveHead,
    ok: true,
    action: "admit_external_embodiment",
    evidence: ["current turn gate admitted executable embodiment"],
    blockers: [],
    ...overrides,
  };
}

function input(overrides: Partial<TerminalProgressReconcilerInput> = {}): TerminalProgressReconcilerInput {
  return {
    active_branch: branch,
    live_head_sha: liveHead,
    requested_action: "external_platform_embodiment",
    exhausted_actions: ["metadata_reread", "duplicate_status_summary", "duplicate_comment", "local_memory_guard"],
    surfaces: [surface()],
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

export function runTerminalProgressReconcilerProof(): void {
  const embodiment = reconcileTerminalProgress(input());
  expectOk("terminal embodiment", embodiment.ok, embodiment.blockers);
  if (embodiment.action !== "release_external_embodiment") {
    throw new Error(`unexpected embodiment action: ${embodiment.action}`);
  }

  const nonProgress = reconcileTerminalProgress(input({ requested_action: "duplicate_status_summary" }));
  expectBlock("non-progress terminal action", nonProgress.ok, nonProgress.blockers, "duplicate_status_summary");

  const stale = reconcileTerminalProgress(
    input({ surfaces: [surface({ surface_id: "old-status", kind: "direct_status_surface", head_sha: "old-head" })] }),
  );
  expectBlock("stale terminal surface", stale.ok, stale.blockers, "old-head");

  const missingStatus = reconcileTerminalProgress(input({ requested_action: "fresh_status_readback" }));
  expectBlock("missing direct status", missingStatus.ok, missingStatus.blockers, "direct live-head status");

  const status = reconcileTerminalProgress(
    input({
      requested_action: "fresh_status_readback",
      surfaces: [
        surface(),
        surface({
          surface_id: "checks-live-head",
          kind: "direct_status_surface",
          action: "passing_with_warnings",
          evidence: ["Route Governor Proof succeeded", "Node.js 20 warning is non-blocking"],
          warnings: ["Node.js 20 Actions deprecation notice"],
        }),
      ],
    }),
  );
  expectOk("direct status terminal action", status.ok, status.blockers);

  const merge = reconcileTerminalProgress(
    input({
      requested_action: "merge_command",
      surfaces: [
        surface(),
        surface({
          surface_id: "release-candidate-bundle",
          kind: "release_candidate_bundle",
          action: "admit_release_candidate_bundle",
          evidence: ["all release-candidate leases are live-head bound"],
        }),
      ],
    }),
  );
  expectOk("merge command terminal action", merge.ok, merge.blockers);
}

runTerminalProgressReconcilerProof();
