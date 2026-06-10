import { compileContinuationAuthority, type ContinuationAuthorityCandidate } from "./continuation-authority.js";

const liveHead = "417515e7cef9fb083d1b6255c1c57200a696ab4c";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function candidate(overrides: Partial<ContinuationAuthorityCandidate>): ContinuationAuthorityCandidate {
  return {
    candidate_id: "base",
    source_tier: "current_instruction",
    progress_class: "external_platform_embodiment",
    branch: "monday-platform-genesis-01",
    claimed_head_sha: liveHead,
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    proof_artifacts: [],
    new_check_surface_ids: [],
    ...overrides,
  };
}

const verdict = compileContinuationAuthority({
  active_branch: "monday-platform-genesis-01",
  live_head_sha: liveHead,
  previous_status_head_sha: repairedHead,
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
  spent_artifact_classes: ["embodiment_increment_planner", "head_transition_lineage_guard"],
  prohibited_blockers: [`old repaired-head blocker cannot be emitted for ${repairedHead}`],
  candidates: [
    candidate({
      candidate_id: "stale-prompt-repaired-head-blocker",
      source_tier: "prompt_carried_summary",
      progress_class: "old_repaired_head_blocker",
      claimed_head_sha: repairedHead,
      blocker_text: `old repaired-head blocker cannot be emitted for ${repairedHead}`,
    }),
    candidate({
      candidate_id: "continuation-authority-embodiment",
      source_tier: "current_instruction",
      progress_class: "external_platform_embodiment",
      artifact_class: "continuation_authority_compiler",
      changed_files: ["platform/packages/route-governor/src/continuation-authority.ts"],
      executable_artifacts: ["compileContinuationAuthority"],
      routing_artifacts: ["live-head source-tier continuation authority"],
      proof_artifacts: ["platform/packages/route-governor/src/continuation-authority-proof.ts"],
    }),
  ],
});

if (!verdict.ok) {
  throw new Error(`continuation authority proof failed: ${verdict.blockers.join("; ")}`);
}

if (verdict.action !== "select_external_platform_embodiment") {
  throw new Error(`expected executable embodiment selection, received ${verdict.action}`);
}

if (verdict.selected?.candidate_id !== "continuation-authority-embodiment") {
  throw new Error(`expected continuation-authority-embodiment, received ${verdict.selected?.candidate_id ?? "none"}`);
}

if (!verdict.rejected.some((rejection) => rejection.candidate_id === "stale-prompt-repaired-head-blocker")) {
  throw new Error("stale prompt repaired-head blocker was not rejected");
}
