import {
  routeMergedPrContinuationBoundary,
  type MergedPrContinuationBoundaryInput,
} from "./merged-pr-continuation-boundary.js";

function base(overrides: Partial<MergedPrContinuationBoundaryInput> = {}): MergedPrContinuationBoundaryInput {
  return {
    repository_full_name: "timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-",
    pr_number: 2,
    branch: "monday-platform-genesis-01",
    prompt_head_sha: "b38ea247602ae8ebba80c4120ad03b41b26bd841",
    live_head_sha: "4fbd48ca4539986c874f85394188c405b8d25600",
    pr_state: "closed",
    merged: true,
    branch_readable: true,
    branch_continuation_admitted: false,
    requested_surface: "pr_or_branch",
    merge_commit_sha: "744387e081b4126ddba74d03ee11588e76ed3789",
    branch_executable_delta_files: [],
    evidence: ["connector PR readback reports closed/merged"],
    ...overrides,
  };
}

function expectAction(name: string, input: MergedPrContinuationBoundaryInput, action: string, ok: boolean): void {
  const verdict = routeMergedPrContinuationBoundary(input);
  if (verdict.action !== action || verdict.ok !== ok) {
    throw new Error(`${name} expected ${action}/${ok}, got ${verdict.action}/${verdict.ok}: ${verdict.blockers.join("; ")}`);
  }
}

export function runMergedPrContinuationBoundaryProof(): void {
  expectAction("merged PR seals PR surface", base(), "seal_merged_pr_surface", true);

  expectAction(
    "branch-only continuation requires executable delta",
    base({ branch_continuation_admitted: true }),
    "block_missing_branch_executable_delta",
    false,
  );

  expectAction(
    "branch-only continuation is explicit and executable",
    base({
      branch_continuation_admitted: true,
      branch_executable_delta_files: ["platform/packages/route-governor/src/merged-pr-continuation-boundary.ts"],
    }),
    "route_branch_only_continuation",
    true,
  );

  expectAction(
    "open PR remains PR surface",
    base({
      prompt_head_sha: "live-head",
      live_head_sha: "live-head",
      pr_state: "open",
      merged: false,
      merge_commit_sha: null,
    }),
    "continue_open_pr_surface",
    true,
  );

  expectAction(
    "merged PR without merge receipt blocks sealing",
    base({ merge_commit_sha: null }),
    "block_missing_merge_receipt",
    false,
  );

  expectAction(
    "closed unmerged PR blocks continuation",
    base({ pr_state: "closed", merged: false, merge_commit_sha: null }),
    "emit_exact_external_blocker",
    false,
  );

  expectAction(
    "unreadable branch blocks all continuation",
    base({ branch_readable: false }),
    "block_unreadable_branch_surface",
    false,
  );
}

runMergedPrContinuationBoundaryProof();
