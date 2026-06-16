import type { LiveStatusAuthorityVerdict } from "./live-status-authority.js";
import type { MergeFinalizationCommandInput } from "./merge-finalization-command.js";
import type { MergeReadinessVerdict } from "./merge-readiness.js";
import type { ReviewResponseIntakeVerdict } from "./review-response-intake.js";

export type TerminalMergeAdmissionAction =
  | "admit_merge_finalization"
  | "block_branch_mismatch"
  | "block_stale_review_head"
  | "block_stale_status_head"
  | "block_stale_readiness_head"
  | "block_review_not_approved"
  | "block_status_not_accepted"
  | "block_merge_not_ready"
  | "block_missing_admission_id"
  | "block_replayed_admission";

export interface TerminalMergeAdmissionInput {
  admission_id: string;
  spent_admission_ids: string[];
  command_id: string;
  spent_command_ids: string[];
  active_branch: string;
  live_head_sha: string;
  review: ReviewResponseIntakeVerdict;
  status: LiveStatusAuthorityVerdict;
  readiness: MergeReadinessVerdict;
  merge_method: "squash" | "merge" | "rebase";
}

export interface TerminalMergeAdmissionVerdict {
  ok: boolean;
  action: TerminalMergeAdmissionAction;
  admission_id: string | null;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  command_input: MergeFinalizationCommandInput | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function base(input: TerminalMergeAdmissionInput): Pick<
  TerminalMergeAdmissionVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "warnings"
> {
  return {
    repository_full_name: input.readiness.repository_full_name,
    pr_number: input.readiness.pr_number,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    warnings: [...input.status.warnings, ...input.readiness.warnings],
  };
}

function evidence(input: TerminalMergeAdmissionInput): string[] {
  return [
    `admission ${input.admission_id || "<none>"}`,
    `review action ${input.review.action}`,
    `review head ${input.review.head_sha}`,
    `status action ${input.status.action}`,
    `status head ${input.status.head_sha}`,
    `readiness action ${input.readiness.action}`,
    `readiness head ${input.readiness.head_sha}`,
    `live head ${input.live_head_sha}`,
  ];
}

function block(
  input: TerminalMergeAdmissionInput,
  action: Exclude<TerminalMergeAdmissionAction, "admit_merge_finalization">,
  blockers: string[],
  nextRoute: string,
  decisiveEvidence: string[] = evidence(input),
): TerminalMergeAdmissionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admission_id: null,
    command_input: null,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

function branchBlockers(input: TerminalMergeAdmissionInput): string[] {
  const blockers: string[] = [];
  if (input.review.branch !== input.active_branch) {
    blockers.push(`review branch ${input.review.branch} is not active branch ${input.active_branch}`);
  }
  if (input.status.branch !== input.active_branch) {
    blockers.push(`status branch ${input.status.branch} is not active branch ${input.active_branch}`);
  }
  if (input.readiness.branch !== input.active_branch) {
    blockers.push(`readiness branch ${input.readiness.branch} is not active branch ${input.active_branch}`);
  }
  return blockers;
}

export function admitTerminalMergeFinalization(
  input: TerminalMergeAdmissionInput,
): TerminalMergeAdmissionVerdict {
  const admissionId = input.admission_id.trim();
  if (!admissionId) {
    return block(
      input,
      "block_missing_admission_id",
      ["terminal merge admission has no admission id"],
      "compile terminal merge admission with a durable admission id before issuing any merge command",
    );
  }

  if (input.spent_admission_ids.includes(admissionId)) {
    return block(
      input,
      "block_replayed_admission",
      [`terminal merge admission already spent: ${admissionId}`],
      "do not reissue a terminal merge admission for the same live-head evidence bundle",
    );
  }

  const wrongBranches = branchBlockers(input);
  if (wrongBranches.length > 0) {
    return block(
      input,
      "block_branch_mismatch",
      wrongBranches,
      "rebind review, status, and readiness surfaces to the active manifestation branch",
    );
  }

  if (input.review.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_review_head",
      [`review response head ${input.review.head_sha} is not live head ${input.live_head_sha}`],
      "refresh review-response intake against the live PR head before merge admission",
    );
  }

  if (input.status.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status_head",
      [`status authority head ${input.status.head_sha} is not live head ${input.live_head_sha}`],
      "refresh live-status authority against the live PR head before merge admission",
    );
  }

  if (input.readiness.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_readiness_head",
      [`merge readiness head ${input.readiness.head_sha} is not live head ${input.live_head_sha}`],
      "refresh merge readiness against the live PR head before merge admission",
    );
  }

  if (!input.review.ok || input.review.action !== "route_to_merge_gate") {
    return block(
      input,
      "block_review_not_approved",
      [
        ...input.review.blockers,
        `review response action is ${input.review.action}, not route_to_merge_gate`,
      ],
      "wait for live-head approval or repair live-head review changes before merge admission",
    );
  }

  if (!input.status.ok || input.status.action !== "accept_live_status_evidence") {
    return block(
      input,
      "block_status_not_accepted",
      [
        ...input.status.blockers,
        `status authority action is ${input.status.action}, not accept_live_status_evidence`,
      ],
      "obtain accepted live-head status evidence before merge admission",
    );
  }

  if (!input.readiness.ok || input.readiness.action !== "merge_ready") {
    return block(
      input,
      "block_merge_not_ready",
      [
        ...input.readiness.blockers,
        `merge readiness action is ${input.readiness.action}, not merge_ready`,
      ],
      "resolve merge-readiness blockers before compiling terminal merge admission",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_merge_finalization",
    admission_id: admissionId,
    command_input: {
      readiness: input.readiness,
      live_head_sha: input.live_head_sha,
      command_id: input.command_id,
      spent_command_ids: input.spent_command_ids,
      external_boundary: "github_pull_request_merge",
      merge_method: input.merge_method,
    },
    decisive_evidence: [
      ...evidence(input),
      ...input.review.decisive_evidence,
      ...input.status.decisive_evidence,
      ...input.readiness.decisive_evidence,
    ],
    blockers: [],
    next_route: "compile and execute the GitHub merge command only while the PR head still equals the admitted live head",
  };
}
