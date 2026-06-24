import { guardInstructionProhibitedBlocker } from "./instruction-prohibited-blocker.js";

const branch = "monday-platform-genesis-01";
const liveHead = "264abd50612ac7d16408f5e368cadf215f576149";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";

const base = {
  active_branch: branch,
  live_head_sha: liveHead,
  prohibited_exact_blockers: ["old repaired-head status-readback blocker"],
  prohibited_head_shas: [repairedHead],
  prohibited_blocker_terms: ["repaired-head status-readback blocker", "ci-status-readback"],
};

const admittedEmbodiment = guardInstructionProhibitedBlocker({
  ...base,
  candidate: {
    move_class: "external_platform_embodiment",
    branch,
    base_head_sha: liveHead,
  },
});
if (!admittedEmbodiment.ok || admittedEmbodiment.action !== "admit_candidate") {
  throw new Error(`live-head embodiment should be admitted: ${admittedEmbodiment.blockers.join("; ")}`);
}
if (!admittedEmbodiment.quarantined_head_shas.includes(repairedHead)) {
  throw new Error("prohibited repaired head should remain quarantined while embodiment is admitted");
}

const oldHeadBlocker = guardInstructionProhibitedBlocker({
  ...base,
  candidate: {
    move_class: "exact_external_blocker",
    branch,
    base_head_sha: liveHead,
    blocker: `status-readback blocker for ${repairedHead}`,
  },
});
if (oldHeadBlocker.ok || oldHeadBlocker.action !== "block_prohibited_head_blocker") {
  throw new Error("old repaired-head blocker must be blocked by prohibited head sha");
}

const termBlocker = guardInstructionProhibitedBlocker({
  ...base,
  candidate: {
    move_class: "exact_external_blocker",
    branch,
    base_head_sha: liveHead,
    blocker: "CI-status-readback is still blocking the branch",
  },
});
if (termBlocker.ok || termBlocker.action !== "block_prohibited_term_blocker") {
  throw new Error("ci-status-readback blocker variant must be blocked by prohibited term");
}

const staleCandidate = guardInstructionProhibitedBlocker({
  ...base,
  candidate: {
    move_class: "external_platform_embodiment",
    branch,
    base_head_sha: repairedHead,
  },
});
if (staleCandidate.ok || staleCandidate.action !== "block_stale_candidate_head") {
  throw new Error("candidate based on repaired historical head must be blocked");
}

const newLiveBlocker = guardInstructionProhibitedBlocker({
  ...base,
  candidate: {
    move_class: "exact_external_blocker",
    branch,
    base_head_sha: liveHead,
    blocker: "live branch write surface is unavailable",
  },
});
if (!newLiveBlocker.ok || newLiveBlocker.action !== "admit_candidate") {
  throw new Error(`new live-head blocker should be admitted: ${newLiveBlocker.blockers.join("; ")}`);
}

console.log("instruction prohibited blocker proof passed");
