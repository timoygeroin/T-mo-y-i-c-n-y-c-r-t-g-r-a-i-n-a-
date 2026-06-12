export type ScheduledFinalizationIngressAction =
  | "admit_scheduled_finalization_ingress"
  | "block_missing_live_pr_metadata"
  | "block_inactive_pr_state"
  | "block_branch_mismatch"
  | "block_stale_latest_receipt"
  | "block_prohibited_progress_class";

export type ScheduledIngressProgressClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_completed_blocker"
  | "old_repaired_head_blocker";

export interface ScheduledFinalizationPrMetadata {
  branch: string;
  head_sha: string;
  state: "open" | "closed";
  draft: boolean;
  mergeable: boolean | null;
}

export interface ScheduledFinalizationIngressReceipt {
  receipt_id: string;
  branch: string;
  head_sha: string;
  progress_class: ScheduledIngressProgressClass;
}

export interface ScheduledFinalizationIngressInput {
  active_branch: string;
  instruction_branch: string;
  instruction_head_sha: string;
  live_pr?: ScheduledFinalizationPrMetadata;
  latest_receipt?: ScheduledFinalizationIngressReceipt;
  resolved_repaired_head_sha?: string;
  prohibited_progress_classes: ScheduledIngressProgressClass[];
}

export interface ScheduledFinalizationIngressVerdict {
  ok: boolean;
  action: ScheduledFinalizationIngressAction;
  branch: string;
  head_sha: string | null;
  admitted_receipt_id: string | null;
  quarantined_instruction_head_sha: string | null;
  historical_repaired_head_sha: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<ScheduledIngressProgressClass>([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "old_repaired_head_blocker",
]);

function historicalRepairedHead(input: ScheduledFinalizationIngressInput): string | null {
  if (!input.resolved_repaired_head_sha) return null;
  return input.instruction_head_sha === input.resolved_repaired_head_sha ? input.resolved_repaired_head_sha : null;
}

function base(input: ScheduledFinalizationIngressInput): Pick<
  ScheduledFinalizationIngressVerdict,
  "branch" | "head_sha" | "quarantined_instruction_head_sha" | "historical_repaired_head_sha"
> {
  const liveHead = input.live_pr?.head_sha ?? null;
  return {
    branch: input.live_pr?.branch ?? input.active_branch,
    head_sha: liveHead,
    quarantined_instruction_head_sha: liveHead && input.instruction_head_sha !== liveHead ? input.instruction_head_sha : null,
    historical_repaired_head_sha: historicalRepairedHead(input),
  };
}

function block(
  input: ScheduledFinalizationIngressInput,
  action: Exclude<ScheduledFinalizationIngressAction, "admit_scheduled_finalization_ingress">,
  blockers: string[],
  nextRoute: string,
  decisiveEvidence: string[] = [],
): ScheduledFinalizationIngressVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_receipt_id: null,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

export function compileScheduledFinalizationIngress(
  input: ScheduledFinalizationIngressInput,
): ScheduledFinalizationIngressVerdict {
  if (!input.live_pr) {
    return block(
      input,
      "block_missing_live_pr_metadata",
      ["scheduled finalization ingress has no live PR metadata"],
      "read the live PR branch and head before selecting status, embodiment, or blocker routing",
    );
  }

  if (input.live_pr.branch !== input.active_branch || input.instruction_branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [
        ...(input.live_pr.branch !== input.active_branch
          ? [`live PR branch ${input.live_pr.branch} does not match active branch ${input.active_branch}`]
          : []),
        ...(input.instruction_branch !== input.active_branch
          ? [`instruction branch ${input.instruction_branch} does not match active branch ${input.active_branch}`]
          : []),
      ],
      "bind scheduled finalization ingress to the active manifestation branch before route choice",
    );
  }

  if (input.live_pr.state !== "open" || input.live_pr.draft) {
    return block(
      input,
      "block_inactive_pr_state",
      [
        ...(input.live_pr.state !== "open" ? [`live PR state is ${input.live_pr.state}`] : []),
        ...(input.live_pr.draft ? ["live PR is still draft"] : []),
      ],
      "restore an open ready-for-review PR surface before scheduled finalization can continue",
      [`live head ${input.live_pr.head_sha}`],
    );
  }

  const receipt = input.latest_receipt;
  if (!receipt) {
    return block(
      input,
      "block_stale_latest_receipt",
      ["scheduled finalization ingress has no latest progress receipt"],
      "attach the latest live-head receipt before route choice",
      [`live head ${input.live_pr.head_sha}`],
    );
  }

  if (receipt.branch !== input.active_branch || receipt.head_sha !== input.live_pr.head_sha) {
    return block(
      input,
      "block_stale_latest_receipt",
      [
        ...(receipt.branch !== input.active_branch
          ? [`latest receipt branch ${receipt.branch} does not match active branch ${input.active_branch}`]
          : []),
        ...(receipt.head_sha !== input.live_pr.head_sha
          ? [`latest receipt head ${receipt.head_sha} does not match live head ${input.live_pr.head_sha}`]
          : []),
      ],
      "refresh the progress receipt ledger from the live PR head before route choice",
      [`latest receipt ${receipt.receipt_id}`, `live head ${input.live_pr.head_sha}`],
    );
  }

  if (NON_PROGRESS_CLASSES.has(receipt.progress_class) || input.prohibited_progress_classes.includes(receipt.progress_class)) {
    return block(
      input,
      "block_prohibited_progress_class",
      [`latest receipt carries prohibited progress class: ${receipt.progress_class}`],
      "advance through an admissible external embodiment, fresh status readback, or exact blocker receipt",
      [receipt.receipt_id, receipt.progress_class],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_scheduled_finalization_ingress",
    admitted_receipt_id: receipt.receipt_id,
    decisive_evidence: [
      `live PR open on ${input.active_branch}`,
      `live head ${input.live_pr.head_sha}`,
      `latest receipt ${receipt.receipt_id}`,
      receipt.progress_class,
      ...(input.live_pr.mergeable === null ? ["mergeability unknown but not contradictory"] : [`mergeable ${input.live_pr.mergeable}`]),
      ...(input.instruction_head_sha !== input.live_pr.head_sha
        ? [`quarantined instruction head ${input.instruction_head_sha}`]
        : []),
      ...(historicalRepairedHead(input) ? [`resolved repaired head preserved as history ${historicalRepairedHead(input)}`] : []),
    ],
    blockers: [],
    next_route: "route scheduled finalization from the live PR head and latest admitted receipt only",
  };
}
