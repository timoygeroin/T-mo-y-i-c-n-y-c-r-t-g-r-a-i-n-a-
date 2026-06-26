import { routePullRequestResolutionState } from "./pr-resolution-state-boundary.js";

const branch = "monday-platform-genesis-01";
const mergedHead = "4fbd48ca4539986c874f85394188c405b8d25600";

const merged = routePullRequestResolutionState({
  active_branch: branch,
  expected_head_sha: mergedHead,
  merge_receipt_ids: ["merge-result-pr-2-744387e0"],
  surface: {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch,
    head_sha: mergedHead,
    state: "closed",
    merged: true,
    merged_at: "2026-06-24T22:03:25Z",
    merge_commit_sha: "744387e081b4126ddba74d03ee11588e76ed3789",
  },
});

if (!merged.ok || merged.action !== "seal_merged_pr_sink") {
  throw new Error(`merged PR sink was not sealed: ${merged.blockers.join("; ")}`);
}

if (!merged.next_route.includes("stop adding PR #2 embodiment increments")) {
  throw new Error("merged PR sink did not stop further PR #2 embodiment increments");
}

const missingReceipt = routePullRequestResolutionState({
  active_branch: branch,
  expected_head_sha: mergedHead,
  merge_receipt_ids: [],
  surface: {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch,
    head_sha: mergedHead,
    state: "closed",
    merged: true,
    merged_at: "2026-06-24T22:03:25Z",
    merge_commit_sha: "744387e081b4126ddba74d03ee11588e76ed3789",
  },
});

if (missingReceipt.ok || missingReceipt.action !== "block_missing_merge_receipt") {
  throw new Error("merged PR sink was sealed without a durable merge receipt");
}

const closedUnmerged = routePullRequestResolutionState({
  active_branch: branch,
  expected_head_sha: mergedHead,
  merge_receipt_ids: [],
  surface: {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch,
    head_sha: mergedHead,
    state: "closed",
    merged: false,
  },
});

if (closedUnmerged.ok || closedUnmerged.action !== "emit_closed_unmerged_pr_blocker") {
  throw new Error("closed unmerged PR did not emit the exact sink blocker");
}

const staleHead = routePullRequestResolutionState({
  active_branch: branch,
  expected_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
  merge_receipt_ids: ["merge-result-pr-2-744387e0"],
  surface: {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch,
    head_sha: mergedHead,
    state: "closed",
    merged: true,
    merge_commit_sha: "744387e081b4126ddba74d03ee11588e76ed3789",
  },
});

if (staleHead.ok || staleHead.action !== "block_head_mismatch") {
  throw new Error("stale repaired-head expectation was accepted for the merged PR surface");
}

console.log(JSON.stringify(merged, null, 2));
