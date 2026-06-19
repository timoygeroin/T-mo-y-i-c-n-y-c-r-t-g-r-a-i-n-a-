export type PostWriteStatusEscrowNextAction =
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "external_platform_embodiment"
  | "review_request"
  | "merge_command"
  | "metadata_reread"
  | "warning_maintenance";

export type PostWriteStatusConclusion = "success" | "failure" | "pending" | "warning_only" | "no_status";

export type PostWriteStatusEscrowAction =
  | "open_post_write_status_escrow"
  | "release_head_bound_status"
  | "block_branch_mismatch"
  | "block_reused_escrow"
  | "block_non_write_delta"
  | "block_missing_routing_artifact"
  | "block_unmoved_head"
  | "block_historical_result_head"
  | "block_stale_status_authority"
  | "block_premature_next_action";

export interface PostWriteStatusClaim {
  source_id: string;
  branch: string;
  head_sha: string;
  conclusion: PostWriteStatusConclusion;
  evidence: string[];
}

export interface PostWriteReceipt {
  commit_sha: string;
  changed_files: string[];
  behavior_artifacts: string[];
  routing_artifacts: string[];
}

export interface PostWriteStatusEscrowInput {
  active_branch: string;
  branch: string;
  base_head_sha: string;
  resulting_head_sha: string;
  repaired_historical_heads: string[];
  spent_escrow_ids: string[];
  escrow_id: string;
  write_receipt: PostWriteReceipt;
  status_claims: PostWriteStatusClaim[];
  requested_next_action: PostWriteStatusEscrowNextAction;
}

export interface PostWriteStatusEscrowVerdict {
  ok: boolean;
  action: PostWriteStatusEscrowAction;
  branch: string;
  base_head_sha: string;
  required_status_head_sha: string;
  escrow_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const PREMATURE_ACTIONS = new Set<PostWriteStatusEscrowNextAction>([
  "external_platform_embodiment",
  "review_request",
  "merge_command",
  "metadata_reread",
  "warning_maintenance",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorPath(path: string): boolean {
  return (
    executablePlatformPath(path) &&
    path !== "platform/packages/route-governor/package.json" &&
    path !== "platform/packages/route-governor/src/index.ts" &&
    !/(?:\.test|-proof)\.ts$/.test(path)
  );
}

function successLikeStatus(claim: PostWriteStatusClaim): boolean {
  return claim.conclusion === "success" || claim.conclusion === "warning_only";
}

function base(input: PostWriteStatusEscrowInput): Pick<
  PostWriteStatusEscrowVerdict,
  "branch" | "base_head_sha" | "required_status_head_sha" | "escrow_id"
> {
  return {
    branch: input.active_branch,
    base_head_sha: input.base_head_sha,
    required_status_head_sha: input.resulting_head_sha,
    escrow_id: input.escrow_id.trim() || null,
  };
}

function block(
  input: PostWriteStatusEscrowInput,
  action: Exclude<PostWriteStatusEscrowAction, "open_post_write_status_escrow" | "release_head_bound_status">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PostWriteStatusEscrowVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function openPostWriteStatusEscrow(input: PostWriteStatusEscrowInput): PostWriteStatusEscrowVerdict {
  const receiptEvidence = [
    `write ${input.write_receipt.commit_sha}`,
    ...input.write_receipt.changed_files,
    ...input.write_receipt.behavior_artifacts,
    ...input.write_receipt.routing_artifacts,
  ];

  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`post-write escrow branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind the post-write status escrow to the active PR branch",
      receiptEvidence,
    );
  }

  const escrowId = input.escrow_id.trim();
  if (!escrowId || input.spent_escrow_ids.includes(escrowId)) {
    return block(
      input,
      "block_reused_escrow",
      [escrowId ? `post-write status escrow already spent: ${escrowId}` : "post-write status escrow has no id"],
      "issue a fresh escrow id for the moved head before routing status authority",
      receiptEvidence,
    );
  }

  if (input.resulting_head_sha === input.base_head_sha) {
    return block(
      input,
      "block_unmoved_head",
      [`post-write status escrow result did not move from ${input.base_head_sha}`],
      "perform a real branch write before opening post-write status escrow",
      receiptEvidence,
    );
  }

  if (input.repaired_historical_heads.includes(input.resulting_head_sha)) {
    return block(
      input,
      "block_historical_result_head",
      [`post-write result ${input.resulting_head_sha} is a repaired historical head`],
      "discard repaired-head authority and require the status surface for the newly moved head",
      receiptEvidence,
    );
  }

  if (!input.write_receipt.changed_files.some(behaviorPath) || input.write_receipt.behavior_artifacts.length === 0) {
    return block(
      input,
      "block_non_write_delta",
      ["post-write status escrow requires a behavior-bearing platform write receipt"],
      "attach the behavior-bearing write receipt before accepting post-write status escrow",
      receiptEvidence,
    );
  }

  if (input.write_receipt.routing_artifacts.length === 0) {
    return block(
      input,
      "block_missing_routing_artifact",
      ["post-write status escrow requires a future-routing artifact"],
      "name the routing artifact that future status authority must pass through",
      receiptEvidence,
    );
  }

  const staleStatus = input.status_claims.find(
    (claim) => claim.branch === input.active_branch && claim.head_sha !== input.resulting_head_sha && successLikeStatus(claim),
  );
  if (staleStatus) {
    return block(
      input,
      "block_stale_status_authority",
      [`status source ${staleStatus.source_id} is bound to ${staleStatus.head_sha}, not ${input.resulting_head_sha}`],
      "ignore stale status authority and read checks for the moved post-write head",
      [staleStatus.source_id, ...staleStatus.evidence],
    );
  }

  const resultingStatus = input.status_claims.find(
    (claim) => claim.branch === input.active_branch && claim.head_sha === input.resulting_head_sha,
  );
  if (resultingStatus && successLikeStatus(resultingStatus)) {
    return {
      ...base(input),
      ok: true,
      action: "release_head_bound_status",
      decisive_evidence: [
        `escrow ${escrowId}`,
        `status head ${input.resulting_head_sha}`,
        resultingStatus.source_id,
        ...resultingStatus.evidence,
      ],
      blockers: [],
      next_route: "consume only this moved-head status surface for later review, merge, or embodiment routing",
    };
  }

  if (PREMATURE_ACTIONS.has(input.requested_next_action)) {
    return block(
      input,
      "block_premature_next_action",
      [`${input.requested_next_action} cannot consume the branch before moved-head status escrow is satisfied`],
      "read fresh status for the moved post-write head or emit the exact external blocker",
      receiptEvidence,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "open_post_write_status_escrow",
    decisive_evidence: [
      `escrow ${escrowId}`,
      `base ${input.base_head_sha}`,
      `required status head ${input.resulting_head_sha}`,
      ...receiptEvidence,
    ],
    blockers: [],
    next_route: "read fresh status for the moved post-write head before any promotion, review, merge, or further embodiment route consumes it",
  };
}
