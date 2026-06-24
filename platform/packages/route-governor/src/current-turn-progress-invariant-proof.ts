import { enforceCurrentTurnProgressInvariant } from "./current-turn-progress-invariant.js";

const verdict = enforceCurrentTurnProgressInvariant({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: "d57ae51212880926194f293df95a6dc91ec11f44",
  last_status_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
  scope_reopened: false,
  prohibited_progress_classes: [
    "metadata_reread",
    "duplicate_ci_summary",
    "duplicate_comment",
    "duplicate_label",
    "local_memory_guard",
    "guessed_future_ci",
    "reclose_completed_blocker",
    "old_repaired_head_blocker",
  ],
  candidate: {
    progress_class: "external_platform_embodiment",
    branch: "monday-platform-genesis-01",
    base_head_sha: "d57ae51212880926194f293df95a6dc91ec11f44",
    terminal_operations: ["external_platform_embodiment"],
    changed_files: ["platform/packages/route-governor/src/current-turn-progress-invariant.ts"],
    behavior_exports: ["enforceCurrentTurnProgressInvariant"],
    routing_effects: ["current turn must select exactly one allowed terminal progress class"],
    proof_artifacts: ["platform/packages/route-governor/src/current-turn-progress-invariant.test.ts"],
  },
});

if (!verdict.ok || verdict.action !== "admit_external_embodiment") {
  throw new Error(`current turn progress invariant proof failed: ${verdict.blockers.join("; ")}`);
}

console.log("current turn progress invariant proof passed");
