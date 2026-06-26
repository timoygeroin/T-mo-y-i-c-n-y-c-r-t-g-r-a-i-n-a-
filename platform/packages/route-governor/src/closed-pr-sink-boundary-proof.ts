import { compileClosedPrSinkBoundary } from "./closed-pr-sink-boundary.js";

const mergedPrSurface = compileClosedPrSinkBoundary({
  pr_number: 2,
  pr_state: "merged",
  branch: "monday-platform-genesis-01",
  head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
  merged_at: "2026-06-24T22:03:25Z",
  branch_writable: true,
  current_instruction_allows_branch_only: true,
  requested_surface: "pull_request",
});

const branchOnlySurface = compileClosedPrSinkBoundary({
  pr_number: 2,
  pr_state: "merged",
  branch: "monday-platform-genesis-01",
  head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
  merged_at: "2026-06-24T22:03:25Z",
  branch_writable: true,
  current_instruction_allows_branch_only: true,
  requested_surface: "head_branch",
});

if (mergedPrSurface.ok) {
  throw new Error("merged PR sink was incorrectly admitted as an open PR review surface");
}

if (!branchOnlySurface.ok) {
  throw new Error(`branch-only continuation was incorrectly blocked: ${branchOnlySurface.blockers.join("; ")}`);
}

console.log("closed PR sink boundary proof passed");
