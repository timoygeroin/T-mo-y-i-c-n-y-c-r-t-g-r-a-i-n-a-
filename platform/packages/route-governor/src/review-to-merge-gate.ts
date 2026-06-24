import type { MergeFinalizationStatusSurface } from "./merge-finalization-command.js";
import type { MergeabilityLeaseVerdict } from "./mergeability-lease.js";
import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";

export type ReviewToMergeGateAction =
  | "admit_merge_finalization_gate"
  | "route_to_review_repair"
  | "wait_for_review_response"
  | "block_repeated_gate"
  | "block_stale_review_intake"
  | "block_review_not_approved"
  | "block_missing_mergeability_lease"
  | "block_stale_mergeability_lease"
  | "block_status_not_current"
  | "block_status_not_passing"
  | "block_pr_not_merge_ready";

export interface ReviewToMergeGateInput {
  gate_id: string;
  spent_gate_ids: string[];
  active_branch: string;
  live_head_sha: string;
  draft: boolean;
  mergeable: boolean;
  required_approval_count: number;
  review_intake: ReviewResponseIntakeVerdict;
  mergeability_lease: MergeabilityLeaseVerdict | null;
  status_surface: MergeFinalizationStatusSurface | null;
}

export interface ReviewToMergeGateVerdict {
  ok: boolean;
  action: ReviewToMergeGateAction;
  gate_id: string | null;
  branch: string;
  head_sha: string;
  approvals: string[];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function statusPassing(surface: MergeFinalizationStatusSurface): boolean {
  return (
    (surface.verdict === "passing" || surface.verdict === "passing_with_warnings") &&
    surface.decisive_successes.length > 0 &&
    surface.blocking_failures.length === 0 &&
    surface.pending_surfaces.length === 0
  );
}

function base(input: ReviewToMergeGateInput): Pick<
  ReviewToMergeGateVerdict,
  "gate_id" | "branch" | "head_sha" | "approvals" | "warnings"
> {
  return {
    gate_id: input.gate_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    approvals: input.review_intake.approvals,
    warnings: input.status_surface?.non_blocking_warnings ?? [],
  };
}

function block(
  input: ReviewToMergeGateInput,
  action: Exclude<ReviewToMergeGateAction, "admit_merge_finalization_gate">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ReviewToMergeGateVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function compileReviewToMergeGate(input: ReviewToMergeGateInput): ReviewToMergeGateVerdict {
  const gateId = input.gate_id.trim();
  const evidence = [
    `gate ${gateId || "<missing>"}`,
    `live head ${input.live_head_sha}`,
    `branch ${input.active_branch}`,
  ];

  if (!gateId || input.spent_gate_ids.includes(gateId)) {
    return block(
      input,
      "block_repeated_gate",
      [gateId ? `review-to-merge gate already spent: ${gateId}` : "review-to-merge gate has no id"],
      "compile each review-to-merge handoff with a fresh durable gate id",
      evidence,
    );
  }

  if (input.review_intake.branch !== input.active_branch || input.review_intake.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_review_intake",
      [
        ...(input.review_intake.branch !== input.active_branch
          ? [`review intake branch ${input.review_intake.branch} is not active branch ${input.active_branch}`]
          : []),
        ...(input.review_intake.head_sha !== input.live_head_sha
          ? [`review intake head ${input.review_intake.head_sha} is not live head ${input.live_head_sha}`]
          : []),
      ],
      "refresh review response intake from the live PR head before merge gating",
      [...evidence, ...input.review_intake.decisive_evidence],
    );
  }

  if (input.review_intake.action === "route_to_review_repair") {
    return block(
      input,
      "route_to_review_repair",
      input.review_intake.blockers,
      "repair requested review changes before merge finalization gating",
      [...evidence, ...input.review_intake.decisive_evidence],
    );
  }

  if (input.review_intake.action === "wait_for_review_response") {
    return block(
      input,
      "wait_for_review_response",
      input.review_intake.blockers,
      "wait for required live-head review approval before merge finalization gating",
      [...evidence, ...input.review_intake.decisive_evidence],
    );
  }

  const requiredApprovals = Math.max(1, input.required_approval_count);
  if (!input.review_intake.ok || input.review_intake.action !== "route_to_merge_gate" || input.review_intake.approvals.length < requiredApprovals) {
    return block(
      input,
      "block_review_not_approved",
      [
        ...input.review_intake.blockers,
        `review intake action is ${input.review_intake.action}`,
        `merge gate requires ${requiredApprovals} approval(s); got ${input.review_intake.approvals.length}`,
      ],
      "obtain live-head review approval before merge finalization gating",
      [...evidence, ...input.review_intake.decisive_evidence],
    );
  }

  const lease = input.mergeability_lease;
  if (!lease) {
    return block(
      input,
      "block_missing_mergeability_lease",
      ["merge finalization gate has no live mergeability lease"],
      "compile a live PR metadata mergeability lease for the merge command target",
      evidence,
    );
  }

  if (
    !lease.ok ||
    lease.action !== "admit_mergeability_lease" ||
    lease.branch !== input.active_branch ||
    lease.head_sha !== input.live_head_sha ||
    lease.target !== "merge_command"
  ) {
    return block(
      input,
      "block_stale_mergeability_lease",
      [
        ...lease.blockers,
        `mergeability lease action is ${lease.action}`,
        `mergeability lease branch ${lease.branch}`,
        `mergeability lease head ${lease.head_sha}`,
        `mergeability lease target ${lease.target}`,
      ],
      "refresh live PR metadata mergeability for the merge command target before merge gating",
      [...evidence, ...lease.decisive_evidence],
    );
  }

  const status = input.status_surface;
  if (!status || status.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_status_not_current",
      [
        status
          ? `status surface ${status.surface_id} belongs to ${status.head_sha}, not ${input.live_head_sha}`
          : "merge finalization gate has no live-head status surface",
      ],
      "read current live-head status before merge finalization gating",
      status ? [...evidence, status.surface_id] : evidence,
    );
  }

  if (!statusPassing(status)) {
    return block(
      input,
      "block_status_not_passing",
      [
        ...status.blocking_failures,
        ...status.pending_surfaces,
        ...(status.decisive_successes.length === 0 ? ["status surface has no decisive success evidence"] : []),
        `status verdict ${status.verdict}`,
      ],
      "wait for or repair the current live-head status surface before merge finalization gating",
      [...evidence, status.surface_id],
    );
  }

  if (input.draft || !input.mergeable) {
    return block(
      input,
      "block_pr_not_merge_ready",
      [...(input.draft ? ["PR is still draft"] : []), ...(!input.mergeable ? ["GitHub mergeability is not confirmed"] : [])],
      "make the PR non-draft and mergeable before compiling merge finalization",
      [...evidence, ...lease.decisive_evidence, status.surface_id],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_merge_finalization_gate",
    decisive_evidence: [
      ...evidence,
      ...input.review_intake.approvals.map((reviewer) => `approved by ${reviewer}`),
      `mergeability lease ${lease.lease_id ?? "<none>"}`,
      ...lease.decisive_evidence,
      `status surface ${status.surface_id}`,
      ...status.decisive_successes,
    ],
    blockers: [],
    next_route: "compile merge finalization only while review approval, mergeability, and status all remain bound to this live head",
  };
}
