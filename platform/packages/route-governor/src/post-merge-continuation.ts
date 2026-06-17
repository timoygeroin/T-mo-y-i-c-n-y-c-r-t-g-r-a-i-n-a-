import type { MergeResultReceipt } from "./merge-result-receipt.js";

export type PostMergeContinuationAction =
  | "admit_post_merge_platform_continuation"
  | "block_wrong_merge_surface"
  | "block_unmerged_receipt"
  | "block_stale_merge_receipt"
  | "block_replayed_merge_receipt"
  | "block_missing_followup_artifact";

export interface PostMergeContinuationFollowup {
  artifact_path: string;
  executable_artifact: string;
  routing_artifact: string;
  route_gain: string;
}

export interface PostMergeContinuationInput {
  receipt: MergeResultReceipt;
  expected_repository_full_name: string;
  expected_pr_number: number;
  expected_branch: string;
  expected_head_sha: string;
  spent_receipt_ids: string[];
  followup: PostMergeContinuationFollowup;
}

export interface PostMergeContinuationVerdict {
  ok: boolean;
  action: PostMergeContinuationAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  merge_commit_sha: string | null;
  receipt_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function isExecutablePlatformArtifact(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function base(input: PostMergeContinuationInput): Pick<
  PostMergeContinuationVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "merge_commit_sha" | "receipt_id"
> {
  return {
    repository_full_name: input.receipt.repository_full_name,
    pr_number: input.receipt.pr_number,
    branch: input.receipt.branch,
    head_sha: input.receipt.head_sha,
    merge_commit_sha: input.receipt.merge_commit_sha,
    receipt_id: input.receipt.receipt_id,
  };
}

function block(
  input: PostMergeContinuationInput,
  action: Exclude<PostMergeContinuationAction, "admit_post_merge_platform_continuation">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PostMergeContinuationVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [
      `receipt ${input.receipt.receipt_id ?? "<none>"}`,
      `receipt head ${input.receipt.head_sha}`,
      `expected head ${input.expected_head_sha}`,
      ...evidence,
    ],
    blockers,
    next_route: nextRoute,
  };
}

function followupBlockers(followup: PostMergeContinuationFollowup): string[] {
  const blockers: string[] = [];

  if (!followup.artifact_path.trim()) blockers.push("post-merge followup has no artifact path");
  if (followup.artifact_path.trim() && !isExecutablePlatformArtifact(followup.artifact_path)) {
    blockers.push(`post-merge followup is not an executable platform artifact: ${followup.artifact_path}`);
  }
  if (!followup.executable_artifact.trim()) blockers.push("post-merge followup has no executable artifact name");
  if (!followup.routing_artifact.trim()) blockers.push("post-merge followup has no routing artifact name");
  if (!followup.route_gain.trim()) blockers.push("post-merge followup has no route gain");

  return blockers;
}

export function routePostMergeContinuation(input: PostMergeContinuationInput): PostMergeContinuationVerdict {
  const receipt = input.receipt;

  if (
    receipt.repository_full_name !== input.expected_repository_full_name ||
    receipt.pr_number !== input.expected_pr_number ||
    receipt.branch !== input.expected_branch
  ) {
    return block(
      input,
      "block_wrong_merge_surface",
      [
        `merge receipt surface ${receipt.repository_full_name}#${receipt.pr_number}/${receipt.branch} does not match expected ${input.expected_repository_full_name}#${input.expected_pr_number}/${input.expected_branch}`,
      ],
      "discard the merge receipt and re-enter through the active external manifestation sink",
    );
  }

  if (!receipt.ok || receipt.action !== "compile_merge_result_receipt" || !receipt.merge_commit_sha) {
    return block(
      input,
      "block_unmerged_receipt",
      receipt.blockers.length > 0 ? receipt.blockers : ["merge receipt does not prove PR merge completion"],
      "resolve the GitHub merge result before routing post-merge continuation",
      receipt.decisive_evidence,
    );
  }

  if (receipt.head_sha !== input.expected_head_sha) {
    return block(
      input,
      "block_stale_merge_receipt",
      [`merge receipt head ${receipt.head_sha} is not expected head ${input.expected_head_sha}`],
      "compile a merge receipt for the live PR head before post-merge continuation",
      [`merge commit ${receipt.merge_commit_sha}`],
    );
  }

  const receiptId = receipt.receipt_id?.trim();
  if (!receiptId || input.spent_receipt_ids.includes(receiptId)) {
    return block(
      input,
      "block_replayed_merge_receipt",
      [receiptId ? `merge receipt already spent: ${receiptId}` : "merge receipt has no id"],
      "post-merge continuation requires one fresh merge receipt id",
      receipt.decisive_evidence,
    );
  }

  const blockers = followupBlockers(input.followup);
  if (blockers.length > 0) {
    return block(
      input,
      "block_missing_followup_artifact",
      blockers,
      "name the next executable platform artifact before claiming post-merge continuation",
      [`merge commit ${receipt.merge_commit_sha}`],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_post_merge_platform_continuation",
    decisive_evidence: [
      `receipt ${receiptId}`,
      `merged head ${receipt.head_sha}`,
      `merge commit ${receipt.merge_commit_sha}`,
      `next executable artifact ${input.followup.artifact_path}`,
      input.followup.executable_artifact,
      input.followup.routing_artifact,
      input.followup.route_gain,
    ],
    blockers: [],
    next_route: "start the next platform route from the receipted merge commit, not from the closed PR branch or stale repaired-head status",
  };
}
