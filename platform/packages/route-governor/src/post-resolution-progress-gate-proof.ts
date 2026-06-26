import { gatePostResolutionProgress } from "./post-resolution-progress-gate.js";

const branch = "monday-platform-genesis-01";
const repairedHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "919bf9b6222fee3424ecd7be5b006c5a76644688";

const repeatedBlocker = gatePostResolutionProgress({
  active_branch: branch,
  live_head_sha: liveHead,
  repaired_head_sha: repairedHead,
  last_status_readback_head_sha: repairedHead,
  resolved_boundary_ids: ["issue-1-ci-status-readback"],
  forbidden_repeat_classes: ["duplicate_ci_summary", "old_repaired_head_blocker"],
  candidate: {
    candidate_id: "repaired-head-blocker-repeat",
    progress_class: "old_repaired_head_blocker",
    branch,
    base_head_sha: liveHead,
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    proof_artifacts: [],
    blocker: "repaired-head status readback for b38ea247602ae8ebba80c4120ad03b41b26bd841 is missing",
  },
});

if (repeatedBlocker.ok || repeatedBlocker.action !== "block_repeated_non_progress") {
  throw new Error(`expected old repaired-head blocker to be rejected, got ${repeatedBlocker.action}`);
}

const staleReadback = gatePostResolutionProgress({
  active_branch: branch,
  live_head_sha: repairedHead,
  repaired_head_sha: repairedHead,
  last_status_readback_head_sha: repairedHead,
  resolved_boundary_ids: ["issue-1-ci-status-readback"],
  forbidden_repeat_classes: [],
  candidate: {
    candidate_id: "stale-status-readback",
    progress_class: "fresh_status_readback",
    branch,
    base_head_sha: repairedHead,
    changed_files: [],
    executable_artifacts: [],
    routing_artifacts: [],
    proof_artifacts: [],
  },
});

if (staleReadback.ok || staleReadback.action !== "block_stale_status_readback") {
  throw new Error(`expected stale readback to be rejected, got ${staleReadback.action}`);
}

const embodiment = gatePostResolutionProgress({
  active_branch: branch,
  live_head_sha: liveHead,
  repaired_head_sha: repairedHead,
  last_status_readback_head_sha: repairedHead,
  resolved_boundary_ids: ["issue-1-ci-status-readback"],
  forbidden_repeat_classes: ["duplicate_comment", "duplicate_label", "local_memory_guard"],
  candidate: {
    candidate_id: "post-resolution-progress-gate",
    progress_class: "external_platform_embodiment",
    branch,
    base_head_sha: liveHead,
    changed_files: ["platform/packages/route-governor/src/post-resolution-progress-gate.ts"],
    executable_artifacts: ["gatePostResolutionProgress"],
    routing_artifacts: ["retire repaired-head blocker after resolved boundary"],
    proof_artifacts: ["platform/packages/route-governor/src/post-resolution-progress-gate-proof.ts"],
  },
});

if (!embodiment.ok) {
  throw new Error(`expected post-resolution embodiment to be admitted: ${embodiment.blockers.join("; ")}`);
}

if (embodiment.action !== "admit_external_platform_embodiment") {
  throw new Error(`expected embodiment admission, got ${embodiment.action}`);
}

if (!embodiment.retired_boundaries.includes(`repaired-head:${repairedHead}`)) {
  throw new Error("expected repaired head to be retired in post-resolution progress proof");
}

console.log(JSON.stringify({ repeatedBlocker, staleReadback, embodiment }, null, 2));
