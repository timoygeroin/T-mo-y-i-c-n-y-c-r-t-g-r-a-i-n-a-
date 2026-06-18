import type { MergeReadinessVerdict } from "./merge-readiness.js";

export type MergeFinalizationBoundary =
  | "github_pull_request_merge"
  | "comment"
  | "status_readback"
  | "local_memory"
  | "review_request";

export type MergeFinalizationAction =
  | "compile_merge_command"
  | "block_unready_merge"
  | "block_stale_merge_head"
  | "block_external_boundary"
  | "block_repeated_command"
  | "block_missing_command_id";

export interface MergeFinalizationCommandInput {
  readiness: MergeReadinessVerdict;
  live_head_sha: string;
  command_id: string;
  spent_command_ids: string[];
  external_boundary: MergeFinalizationBoundary;
  merge_method: "squash" | "merge" | "rebase";
}

export interface MergeFinalizationCommand {
  command_id: string;
  operation: "merge_pull_request";
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  merge_method: "squash" | "merge" | "rebase";
  guard: {
    require_live_head_sha: string;
    require_readiness_action: "merge_ready";
    forbidden_fallbacks: string[];
  };
}

export interface MergeFinalizationCommandVerdict {
  ok: boolean;
  action: MergeFinalizationAction;
  command: MergeFinalizationCommand | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

export type MergeFinalizationExecutionAction =
  | "admit_merge_execution"
  | "block_stale_merge_head"
  | "block_external_boundary"
  | "block_repeated_command"
  | "block_unready_pr"
  | "block_status_not_passing"
  | "block_missing_review_approval"
  | "block_missing_finalization_surface";

export type MergeFinalizationStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export interface MergeFinalizationStatusSurface {
  surface_id: string;
  head_sha: string;
  verdict: MergeFinalizationStatusVerdict;
  decisive_successes: string[];
  blocking_failures: string[];
  pending_surfaces: string[];
  non_blocking_warnings: string[];
}

export interface MergeFinalizationExecutionInput {
  command: MergeFinalizationCommand;
  active_branch: string;
  live_head_sha: string;
  draft: boolean;
  mergeable: boolean;
  required_approval_count: number;
  approval_count: number;
  external_boundary: MergeFinalizationBoundary;
  status_surface: MergeFinalizationStatusSurface;
  promoted_surface_ids: string[];
  spent_command_ids: string[];
}

export interface MergeFinalizationExecutionVerdict {
  ok: boolean;
  action: MergeFinalizationExecutionAction;
  command: MergeFinalizationCommand | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const REQUIRED_EXECUTION_SURFACES = ["merge-finalization-command-public-surface", "merge-result-receipt-public-surface"];

function block(
  action: Exclude<MergeFinalizationAction, "compile_merge_command">,
  decisiveEvidence: string[],
  blockers: string[],
  nextRoute: string,
): MergeFinalizationCommandVerdict {
  return {
    ok: false,
    action,
    command: null,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

function executionBlock(
  input: MergeFinalizationExecutionInput,
  action: Exclude<MergeFinalizationExecutionAction, "admit_merge_execution">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): MergeFinalizationExecutionVerdict {
  return {
    ok: false,
    action,
    command: null,
    decisive_evidence: [
      `command ${input.command.command_id}`,
      `command head ${input.command.head_sha}`,
      `live head ${input.live_head_sha}`,
      ...evidence,
    ],
    blockers,
    warnings: input.status_surface.non_blocking_warnings,
    next_route: nextRoute,
  };
}

function statusPassing(surface: MergeFinalizationStatusSurface): boolean {
  return (
    (surface.verdict === "passing" || surface.verdict === "passing_with_warnings") &&
    surface.decisive_successes.length > 0 &&
    surface.blocking_failures.length === 0 &&
    surface.pending_surfaces.length === 0
  );
}

export function compileMergeFinalizationCommand(
  input: MergeFinalizationCommandInput,
): MergeFinalizationCommandVerdict {
  const evidence = [
    `readiness action ${input.readiness.action}`,
    `readiness head ${input.readiness.head_sha}`,
    `live head ${input.live_head_sha}`,
    `branch ${input.readiness.branch}`,
  ];

  if (input.external_boundary !== "github_pull_request_merge") {
    return block(
      "block_external_boundary",
      evidence,
      [`merge finalization cannot be released through ${input.external_boundary}`],
      "use the GitHub pull-request merge boundary, or emit the exact external blocker",
    );
  }

  if (!input.readiness.ok || input.readiness.action !== "merge_ready") {
    return block(
      "block_unready_merge",
      evidence,
      [
        ...input.readiness.blockers,
        `merge readiness action is ${input.readiness.action}, not merge_ready`,
      ],
      "resolve merge-readiness blockers before compiling a merge command",
    );
  }

  if (input.readiness.head_sha !== input.live_head_sha) {
    return block(
      "block_stale_merge_head",
      evidence,
      [`merge readiness head ${input.readiness.head_sha} is not live head ${input.live_head_sha}`],
      "refresh merge readiness against the live PR head before compiling a merge command",
    );
  }

  const commandId = input.command_id.trim();
  if (!commandId) {
    return block(
      "block_missing_command_id",
      evidence,
      ["merge finalization command has no command id"],
      "compile merge commands with a durable command id before release",
    );
  }

  if (input.spent_command_ids.includes(commandId)) {
    return block(
      "block_repeated_command",
      evidence,
      [`merge finalization command already spent: ${commandId}`],
      "do not reissue an already spent merge finalization command",
    );
  }

  const command: MergeFinalizationCommand = {
    command_id: commandId,
    operation: "merge_pull_request",
    repository_full_name: input.readiness.repository_full_name,
    pr_number: input.readiness.pr_number,
    branch: input.readiness.branch,
    head_sha: input.readiness.head_sha,
    merge_method: input.merge_method,
    guard: {
      require_live_head_sha: input.live_head_sha,
      require_readiness_action: "merge_ready",
      forbidden_fallbacks: [
        "duplicate_comment",
        "metadata_reread",
        "status_summary_as_merge_clearance",
        "stale_merge_readiness",
        "local_memory_guard",
        "review_request_without_merge_boundary",
      ],
    },
  };

  return {
    ok: true,
    action: "compile_merge_command",
    command,
    decisive_evidence: [
      ...evidence,
      commandId,
      `merge method ${input.merge_method}`,
      ...input.readiness.decisive_evidence,
    ],
    blockers: [],
    next_route: "execute the compiled GitHub merge command only if the PR head still matches the command guard",
  };
}

export function admitMergeFinalizationExecution(
  input: MergeFinalizationExecutionInput,
): MergeFinalizationExecutionVerdict {
  if (input.command.branch !== input.active_branch) {
    return executionBlock(
      input,
      "block_stale_merge_head",
      [`command branch ${input.command.branch} does not match active branch ${input.active_branch}`],
      "recompile the merge command from the active PR branch before execution",
    );
  }

  if (input.command.head_sha !== input.live_head_sha || input.status_surface.head_sha !== input.live_head_sha) {
    return executionBlock(
      input,
      "block_stale_merge_head",
      [
        ...(input.command.head_sha !== input.live_head_sha
          ? [`command head ${input.command.head_sha} is not live head ${input.live_head_sha}`]
          : []),
        ...(input.status_surface.head_sha !== input.live_head_sha
          ? [`status surface ${input.status_surface.surface_id} belongs to ${input.status_surface.head_sha}`]
          : []),
      ],
      "refresh status and recompile the merge command against the current live head",
      [input.status_surface.surface_id],
    );
  }

  if (input.external_boundary !== "github_pull_request_merge") {
    return executionBlock(
      input,
      "block_external_boundary",
      [`merge execution cannot be admitted through ${input.external_boundary}`],
      "execute only through the GitHub pull-request merge boundary, or emit the exact external blocker",
    );
  }

  if (input.spent_command_ids.includes(input.command.command_id)) {
    return executionBlock(
      input,
      "block_repeated_command",
      [`merge finalization command already spent: ${input.command.command_id}`],
      "compile a new live-head merge command before attempting execution again",
    );
  }

  if (input.draft || !input.mergeable) {
    return executionBlock(
      input,
      "block_unready_pr",
      [...(input.draft ? ["PR is still draft"] : []), ...(!input.mergeable ? ["GitHub mergeability is not confirmed"] : [])],
      "make the PR non-draft and mergeable before admitting merge execution",
    );
  }

  if (!statusPassing(input.status_surface)) {
    return executionBlock(
      input,
      "block_status_not_passing",
      [
        ...input.status_surface.blocking_failures,
        ...input.status_surface.pending_surfaces,
        ...(input.status_surface.decisive_successes.length === 0
          ? ["live-head status surface has no decisive success evidence"]
          : []),
        `status verdict ${input.status_surface.verdict}`,
      ],
      "wait for or repair the live-head status surface before merge execution",
      [input.status_surface.surface_id],
    );
  }

  const requiredApprovals = Math.max(1, input.required_approval_count);
  if (input.approval_count < requiredApprovals) {
    return executionBlock(
      input,
      "block_missing_review_approval",
      [`merge execution requires ${requiredApprovals} approval(s); got ${input.approval_count}`],
      "wait for the required live-head review approval before executing the merge command",
    );
  }

  const missingSurfaces = REQUIRED_EXECUTION_SURFACES.filter((surface) => !input.promoted_surface_ids.includes(surface));
  if (missingSurfaces.length > 0) {
    return executionBlock(
      input,
      "block_missing_finalization_surface",
      missingSurfaces.map((surface) => `missing promoted finalization surface ${surface}`),
      "promote merge command and merge receipt surfaces before admitting merge execution",
    );
  }

  return {
    ok: true,
    action: "admit_merge_execution",
    command: input.command,
    decisive_evidence: [
      `live head ${input.live_head_sha}`,
      `status surface ${input.status_surface.surface_id}`,
      ...input.status_surface.decisive_successes,
      `approvals ${input.approval_count}`,
      ...REQUIRED_EXECUTION_SURFACES.map((surface) => `promoted surface ${surface}`),
      `merge method ${input.command.merge_method}`,
    ],
    blockers: [],
    warnings: input.status_surface.non_blocking_warnings,
    next_route: "execute GitHub merge only while the PR head still matches this admitted command, then compile the merge result receipt",
  };
}