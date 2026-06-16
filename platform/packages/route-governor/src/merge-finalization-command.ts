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
