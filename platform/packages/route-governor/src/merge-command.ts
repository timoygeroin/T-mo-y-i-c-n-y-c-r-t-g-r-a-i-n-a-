import type { TerminalReviewHandoffVerdict } from "./terminal-review-handoff.js";

export type MergeCommandMethod = "merge" | "squash" | "rebase";

export type MergeCommandBoundary = "github_pull_request_merge" | "comment" | "status_readback" | "local_memory";

export type MergeCommandAction =
  | "compile_merge_command"
  | "block_external_boundary"
  | "block_unadmitted_handoff"
  | "block_stale_handoff_head"
  | "block_missing_command_id"
  | "block_repeated_command";

export interface MergeCommandInput {
  handoff: TerminalReviewHandoffVerdict;
  live_head_sha: string;
  merge_method: MergeCommandMethod;
  command_id: string;
  spent_command_ids: string[];
  external_boundary: MergeCommandBoundary;
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
    require_handoff_action: "admit_merge";
    forbidden_fallbacks: string[];
  };
}

export interface MergeCommandVerdict {
  ok: boolean;
  action: MergeCommandAction;
  command: MergeCommand | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function evidence(input: MergeCommandInput): string[] {
  return [
    `handoff action ${input.handoff.action}`,
    `handoff head ${input.handoff.head_sha}`,
    `live head ${input.live_head_sha}`,
    `merge method ${input.merge_method}`,
  ];
}

function block(
  action: Exclude<MergeCommandAction, "compile_merge_command">,
  decisiveEvidence: string[],
  blockers: string[],
  nextRoute: string,
): MergeCommandVerdict {
  return {
    ok: false,
    action,
    command: null,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

export function compileMergeCommand(input: MergeCommandInput): MergeCommandVerdict {
  const decisiveEvidence = evidence(input);

  if (input.external_boundary !== "github_pull_request_merge") {
    return block(
      "block_external_boundary",
      decisiveEvidence,
      [`merge command cannot be released through ${input.external_boundary}`],
      "use the GitHub pull-request merge boundary, or emit the exact external merge blocker",
    );
  }

  if (!input.handoff.ok || input.handoff.action !== "admit_merge") {
    return block(
      "block_unadmitted_handoff",
      decisiveEvidence,
      [...input.handoff.blockers, `terminal handoff action is ${input.handoff.action}, not admit_merge`],
      "resolve terminal handoff blockers before compiling a merge command",
    );
  }

  if (input.handoff.head_sha !== input.live_head_sha) {
    return block(
      "block_stale_handoff_head",
      decisiveEvidence,
      [`terminal handoff head ${input.handoff.head_sha} is not live head ${input.live_head_sha}`],
      "refresh merge handoff against the live PR head before compiling a merge command",
    );
  }

  const commandId = input.command_id.trim();
  if (!commandId) {
    return block(
      "block_missing_command_id",
      decisiveEvidence,
      ["merge command has no command id"],
      "compile merge commands with a durable command id before release",
    );
  }

  if (input.spent_command_ids.includes(commandId)) {
    return block(
      "block_repeated_command",
      decisiveEvidence,
      [`merge command already spent: ${commandId}`],
      "do not reissue an already spent merge command for the same live head",
    );
  }

  const command: MergeCommand = {
    command_id: commandId,
    operation: "merge_pull_request",
    repository_full_name: input.handoff.repository_full_name,
    pr_number: input.handoff.pr_number,
    branch: input.handoff.branch,
    expected_head_sha: input.live_head_sha,
    merge_method: input.merge_method,
    guard: {
      require_live_head_sha: input.live_head_sha,
      require_handoff_action: "admit_merge",
      forbidden_fallbacks: [
        "duplicate_comment",
        "metadata_reread",
        "stale_repaired_head_status",
        "stale_terminal_handoff",
        "local_memory_guard",
        "unguarded_merge",
      ],
    },
  };

  return {
    ok: true,
    action: "compile_merge_command",
    command,
    decisive_evidence: [
      ...decisiveEvidence,
      commandId,
      `expected head ${input.live_head_sha}`,
      ...input.handoff.decisive_evidence,
    ],
    blockers: [],
    next_route: "execute the GitHub merge only if the PR head still matches expected_head_sha; otherwise discard this command and re-enter from the moved head",
  };
}
