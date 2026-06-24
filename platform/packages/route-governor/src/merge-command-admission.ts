import type { MergeReadinessVerdict } from "./merge-readiness.js";

export type MergeCommandMethod = "merge" | "squash" | "rebase";

export type MergeCommandAdmissionAction =
  | "compile_merge_command"
  | "block_unready_merge_verdict"
  | "block_stale_merge_head"
  | "block_repeated_merge_command"
  | "block_missing_merge_method"
  | "block_unsafe_merge_boundary";

export interface MergeCommandAdmissionInput {
  readiness: MergeReadinessVerdict;
  live_head_sha: string;
  command_id: string;
  merge_method: MergeCommandMethod | "";
  external_boundary: "github_pull_request_merge" | "comment" | "status_readback" | "local_memory";
  spent_command_ids: string[];
}

export interface MergeCommand {
  command_id: string;
  operation: "merge_pull_request";
  repository_full_name: string;
  pr_number: number;
  branch: string;
  expected_head_sha: string;
  merge_method: MergeCommandMethod;
  guard: {
    require_live_head_sha: string;
    forbidden_fallbacks: string[];
  };
}

export interface MergeCommandAdmissionVerdict {
  ok: boolean;
  action: MergeCommandAdmissionAction;
  command: MergeCommand | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function block(
  action: Exclude<MergeCommandAdmissionAction, "compile_merge_command">,
  evidence: string[],
  blockers: string[],
  nextRoute: string,
): MergeCommandAdmissionVerdict {
  return {
    ok: false,
    action,
    command: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function admitMergeCommand(input: MergeCommandAdmissionInput): MergeCommandAdmissionVerdict {
  const evidence = [
    `readiness action ${input.readiness.action}`,
    `readiness head ${input.readiness.head_sha}`,
    `live head ${input.live_head_sha}`,
    `branch ${input.readiness.branch}`,
  ];

  if (input.external_boundary !== "github_pull_request_merge") {
    return block(
      "block_unsafe_merge_boundary",
      evidence,
      [`merge command cannot be released through ${input.external_boundary}`],
      "use the GitHub pull-request merge boundary, or emit the exact external blocker",
    );
  }

  if (!input.readiness.ok || input.readiness.action !== "merge_ready") {
    return block(
      "block_unready_merge_verdict",
      evidence,
      [...input.readiness.blockers, `merge readiness action is ${input.readiness.action}, not merge_ready`],
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
  if (!commandId || input.spent_command_ids.includes(commandId)) {
    return block(
      "block_repeated_merge_command",
      evidence,
      [commandId ? `merge command already spent: ${commandId}` : "merge command has no command id"],
      "compile each merge command with a new durable command id",
    );
  }

  if (!input.merge_method) {
    return block(
      "block_missing_merge_method",
      evidence,
      ["merge command has no merge method"],
      "choose merge, squash, or rebase before issuing the GitHub merge command",
    );
  }

  const command: MergeCommand = {
    command_id: commandId,
    operation: "merge_pull_request",
    repository_full_name: input.readiness.repository_full_name,
    pr_number: input.readiness.pr_number,
    branch: input.readiness.branch,
    expected_head_sha: input.readiness.head_sha,
    merge_method: input.merge_method,
    guard: {
      require_live_head_sha: input.live_head_sha,
      forbidden_fallbacks: [
        "duplicate_comment",
        "metadata_reread",
        "stale_repaired_head_status",
        "stale_merge_readiness",
        "local_memory_guard",
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
    next_route: "issue the guarded GitHub merge command only if the PR head still matches expected_head_sha",
  };
}
