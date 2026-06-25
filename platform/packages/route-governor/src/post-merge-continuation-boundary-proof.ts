import { routePostMergeContinuationBoundary } from "./post-merge-continuation-boundary.js";

const verdict = routePostMergeContinuationBoundary({
  repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
  pr_number: 2,
  active_branch: "monday-platform-genesis-01",
  live_head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
  pr_head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
  pr_state: "closed",
  merged: true,
  merge_commit_sha: "744387e081b4126ddba74d03ee11588e76ed3789",
  boundary_id: "post-merge-continuation-pr2-proof-001",
  spent_boundary_ids: [],
  requested_progress_class: "external_platform_embodiment",
  branch_followup_allowed: true,
});

if (!verdict.ok || verdict.action !== "route_to_branch_followup_surface") {
  throw new Error(`post-merge continuation boundary proof failed: ${verdict.blockers.join("; ")}`);
}

console.log("post-merge continuation boundary proof passed");
