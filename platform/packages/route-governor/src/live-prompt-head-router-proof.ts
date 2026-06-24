import { routeLivePromptHead, type LivePromptHeadCandidate } from "./live-prompt-head-router.js";

const branch = "monday-platform-genesis-01";
const liveHead = "252792198dccddea23f850c0b917eff1c65b46dc";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

function candidate(overrides: Partial<LivePromptHeadCandidate> = {}): LivePromptHeadCandidate {
  return {
    candidate_id: "live-prompt-head-router",
    active_branch: branch,
    live_head_sha: liveHead,
    prompt_head_sha: repairedHead,
    previous_resolved_head_sha: repairedHead,
    move_class: "external_platform_embodiment",
    changed_files: ["platform/packages/route-governor/src/live-prompt-head-router.ts"],
    executable_artifacts: ["routeLivePromptHead"],
    routing_artifacts: ["resolved prompt heads cannot drive the next PR move after the live head advances"],
    proof_artifacts: ["dist/live-prompt-head-router-proof.js"],
    ...overrides,
  };
}

const admitted = routeLivePromptHead({
  active_branch: branch,
  live_head_sha: liveHead,
  resolved_head_shas: [repairedHead],
  spent_candidate_ids: [],
  candidate: candidate(),
});
if (!admitted.ok || admitted.action !== "admit_runtime_embodiment") {
  throw new Error(`live prompt head router should admit executable embodiment: ${admitted.blockers.join("; ")}`);
}

const staleBlocker = routeLivePromptHead({
  active_branch: branch,
  live_head_sha: liveHead,
  resolved_head_shas: [repairedHead],
  spent_candidate_ids: [],
  candidate: candidate({
    move_class: "old_blocker_replay",
    blocker: `old repaired-head blocker for ${repairedHead}`,
  }),
});
if (staleBlocker.ok || staleBlocker.action !== "block_stale_head_replay") {
  throw new Error("live prompt head router should block resolved-head replay");
}

const liveStatus = routeLivePromptHead({
  active_branch: branch,
  live_head_sha: liveHead,
  resolved_head_shas: [repairedHead],
  spent_candidate_ids: [],
  candidate: candidate({
    candidate_id: "live-status-readback",
    move_class: "fresh_status_readback",
    status_surfaces: [{ id: "check-run-1", head_sha: liveHead, conclusion: "success" }],
  }),
});
if (!liveStatus.ok || liveStatus.action !== "admit_fresh_status_readback") {
  throw new Error("live prompt head router should admit status only when tied to the live head");
}

const exactBlocker = routeLivePromptHead({
  active_branch: branch,
  live_head_sha: liveHead,
  resolved_head_shas: [repairedHead],
  spent_candidate_ids: [],
  candidate: candidate({
    candidate_id: "live-head-blocker",
    move_class: "exact_external_blocker",
    blocker: `external blocker for live head ${liveHead}: Actions log surface unavailable in this runtime`,
  }),
});
if (!exactBlocker.ok || exactBlocker.action !== "emit_exact_external_blocker") {
  throw new Error("live prompt head router should admit blockers only when they name the live head");
}

console.log("live prompt head router proof passed");
