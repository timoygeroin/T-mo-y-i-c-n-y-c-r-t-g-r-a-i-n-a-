export type PostWriteContinuationMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "warning_maintenance";

export type PostWriteContinuationAuthority =
  | "live_pr_metadata"
  | "direct_status_surface"
  | "post_write_receipt"
  | "scheduled_prompt"
  | "memory_receipt"
  | "pr_body_summary";

export type PostWriteContinuationCursorAction =
  | "inherit_moved_post_write_head"
  | "reenter_from_newer_live_head"
  | "read_moved_head_status"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_missing_post_write_receipt"
  | "block_unmoved_or_historical_receipt"
  | "block_non_behavior_receipt"
  | "block_summary_only_authority"
  | "block_stale_candidate_base"
  | "block_non_progress_move";

export interface PostWriteContinuationReceipt {
  receipt_id: string;
  branch: string;
  base_head_sha: string;
  resulting_head_sha: string;
  changed_files: string[];
  behavior_artifacts: string[];
  routing_artifacts: string[];
}

export interface PostWriteContinuationAuthoritySurface {
  surface_id: string;
  authority: PostWriteContinuationAuthority;
  branch: string;
  head_sha?: string;
  evidence: string[];
}

export interface PostWriteContinuationCandidate {
  move_class: PostWriteContinuationMoveClass;
  branch: string;
  base_head_sha: string;
  blocker?: string;
}

export interface PostWriteContinuationCursorInput {
  active_branch: string;
  live_head_sha: string;
  prompt_head_sha?: string;
  repaired_historical_heads: string[];
  spent_receipt_ids: string[];
  receipt?: PostWriteContinuationReceipt;
  authority_surfaces: PostWriteContinuationAuthoritySurface[];
  candidate: PostWriteContinuationCandidate;
}

export interface PostWriteContinuationCursorVerdict {
  ok: boolean;
  action: PostWriteContinuationCursorAction;
  branch: string;
  inherited_head_sha: string;
  required_status_head_sha: string | null;
  accepted_surface_ids: string[];
  stale_surface_ids: string[];
  summary_surface_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const SUMMARY_AUTHORITIES = new Set<PostWriteContinuationAuthority>([
  "scheduled_prompt",
  "memory_receipt",
  "pr_body_summary",
]);

const NON_PROGRESS_MOVES = new Set<PostWriteContinuationMoveClass>([
  "metadata_reread",
  "duplicate_ci_summary",
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

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function classifySurfaces(input: PostWriteContinuationCursorInput): Pick<
  PostWriteContinuationCursorVerdict,
  "accepted_surface_ids" | "stale_surface_ids" | "summary_surface_ids"
> {
  const accepted: string[] = [];
  const stale: string[] = [];
  const summary: string[] = [];

  for (const surface of input.authority_surfaces) {
    if (SUMMARY_AUTHORITIES.has(surface.authority)) summary.push(surface.surface_id);
    if (surface.branch !== input.active_branch) continue;
    if (surface.head_sha && surface.head_sha !== input.live_head_sha) stale.push(surface.surface_id);
    if (surface.head_sha === input.live_head_sha && !SUMMARY_AUTHORITIES.has(surface.authority)) {
      accepted.push(surface.surface_id);
    }
  }

  return {
    accepted_surface_ids: unique(accepted),
    stale_surface_ids: unique(stale),
    summary_surface_ids: unique(summary),
  };
}

function base(input: PostWriteContinuationCursorInput): Pick<
  PostWriteContinuationCursorVerdict,
  "branch" | "inherited_head_sha" | "required_status_head_sha"
> {
  return {
    branch: input.active_branch,
    inherited_head_sha: input.live_head_sha,
    required_status_head_sha: null,
  };
}

function block(
  input: PostWriteContinuationCursorInput,
  action: Exclude<
    PostWriteContinuationCursorAction,
    | "inherit_moved_post_write_head"
    | "reenter_from_newer_live_head"
    | "read_moved_head_status"
    | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PostWriteContinuationCursorVerdict {
  return {
    ...base(input),
    ...classifySurfaces(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function receiptEvidence(receipt: PostWriteContinuationReceipt): string[] {
  return [
    `receipt ${receipt.receipt_id}`,
    `base ${receipt.base_head_sha}`,
    `result ${receipt.resulting_head_sha}`,
    ...receipt.changed_files,
    ...receipt.behavior_artifacts,
    ...receipt.routing_artifacts,
  ];
}

function receiptBlockers(
  input: PostWriteContinuationCursorInput,
  receipt: PostWriteContinuationReceipt,
): string[] {
  const blockers: string[] = [];

  if (!receipt.receipt_id.trim()) blockers.push("post-write continuation receipt has no id");
  if (input.spent_receipt_ids.includes(receipt.receipt_id)) {
    blockers.push(`post-write continuation receipt already spent: ${receipt.receipt_id}`);
  }
  if (receipt.branch !== input.active_branch) {
    blockers.push(`post-write continuation receipt branch ${receipt.branch} does not match ${input.active_branch}`);
  }
  if (receipt.resulting_head_sha === receipt.base_head_sha) {
    blockers.push(`post-write continuation receipt did not move from ${receipt.base_head_sha}`);
  }
  if (input.repaired_historical_heads.includes(receipt.resulting_head_sha)) {
    blockers.push(`post-write continuation receipt result ${receipt.resulting_head_sha} is a repaired historical head`);
  }

  return blockers;
}

function behaviorReceiptBlockers(receipt: PostWriteContinuationReceipt): string[] {
  const blockers: string[] = [];

  if (!receipt.changed_files.some(behaviorPath)) {
    blockers.push("post-write continuation receipt has no behavior-bearing platform file");
  }
  if (receipt.behavior_artifacts.length === 0) {
    blockers.push("post-write continuation receipt has no behavior artifact evidence");
  }
  if (receipt.routing_artifacts.length === 0) {
    blockers.push("post-write continuation receipt has no future-routing artifact evidence");
  }

  return blockers;
}

export function compilePostWriteContinuationCursor(
  input: PostWriteContinuationCursorInput,
): PostWriteContinuationCursorVerdict {
  if (input.candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${input.candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the continuation candidate to the active PR branch before release",
    );
  }

  if (NON_PROGRESS_MOVES.has(input.candidate.move_class)) {
    return block(
      input,
      "block_non_progress_move",
      [`post-write continuation cannot progress through ${input.candidate.move_class}`],
      "choose fresh status readback, external embodiment, or one exact blocker after the post-write cursor",
      [input.candidate.move_class],
    );
  }

  const surfaces = classifySurfaces(input);
  const liveDirectSurface = surfaces.accepted_surface_ids.length > 0;
  if (!liveDirectSurface && surfaces.summary_surface_ids.length > 0) {
    return block(
      input,
      "block_summary_only_authority",
      ["post-write continuation has only summary authority surfaces, not live PR metadata or direct status"],
      "read live PR metadata for the current head before inheriting prompt, PR-body, or memory claims",
      surfaces.summary_surface_ids,
    );
  }

  const receipt = input.receipt;
  if (!receipt) {
    return block(
      input,
      "block_missing_post_write_receipt",
      ["post-write continuation cursor requires the last behavior-bearing write receipt"],
      "attach the last post-write receipt or re-enter from the live PR head if the receipt is unavailable",
    );
  }

  const structuralReceiptBlockers = receiptBlockers(input, receipt);
  if (structuralReceiptBlockers.length > 0) {
    return block(
      input,
      "block_unmoved_or_historical_receipt",
      structuralReceiptBlockers,
      "discard unmoved, spent, mismatched, or historical-head receipts before continuing",
      receiptEvidence(receipt),
    );
  }

  const behaviorBlockers = behaviorReceiptBlockers(receipt);
  if (behaviorBlockers.length > 0) {
    return block(
      input,
      "block_non_behavior_receipt",
      behaviorBlockers,
      "use only behavior-bearing post-write receipts as continuation cursor authority",
      receiptEvidence(receipt),
    );
  }

  if (input.candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_candidate_base",
      [`candidate base ${input.candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the continuation candidate to the live PR head before release",
      receiptEvidence(receipt),
    );
  }

  if (receipt.resulting_head_sha !== input.live_head_sha) {
    return {
      ...base(input),
      ...surfaces,
      ok: true,
      action: "reenter_from_newer_live_head",
      decisive_evidence: [
        `receipt result ${receipt.resulting_head_sha}`,
        `live head ${input.live_head_sha}`,
        ...receiptEvidence(receipt),
      ],
      blockers: [],
      next_route: "discard the older post-write cursor and rebuild the next move from the newer live PR head",
    };
  }

  if (input.candidate.move_class === "fresh_status_readback") {
    return {
      ...base(input),
      ...surfaces,
      ok: true,
      action: "read_moved_head_status",
      required_status_head_sha: receipt.resulting_head_sha,
      decisive_evidence: [
        `live head inherits post-write result ${receipt.resulting_head_sha}`,
        ...receiptEvidence(receipt),
        ...surfaces.accepted_surface_ids,
      ],
      blockers: [],
      next_route: "read status only for the moved post-write head before making pass/fail claims",
    };
  }

  if (input.candidate.move_class === "exact_external_blocker") {
    const blocker = input.candidate.blocker?.trim();
    return {
      ...base(input),
      ...surfaces,
      ok: Boolean(blocker),
      action: blocker ? "emit_exact_external_blocker" : "block_non_progress_move",
      required_status_head_sha: receipt.resulting_head_sha,
      decisive_evidence: blocker ? [blocker, ...receiptEvidence(receipt)] : receiptEvidence(receipt),
      blockers: blocker ? [blocker] : ["post-write exact blocker candidate has no blocker text"],
      next_route: blocker
        ? "remove the exact post-write external blocker before continuing"
        : "name one exact post-write external blocker or read moved-head status",
    };
  }

  return {
    ...base(input),
    ...surfaces,
    ok: true,
    action: "inherit_moved_post_write_head",
    required_status_head_sha: receipt.resulting_head_sha,
    decisive_evidence: [
      `live head inherits post-write result ${receipt.resulting_head_sha}`,
      ...receiptEvidence(receipt),
      ...surfaces.accepted_surface_ids,
    ],
    blockers: [],
    next_route: "continue only from the inherited moved head and bind the next status cursor to that head",
  };
}
