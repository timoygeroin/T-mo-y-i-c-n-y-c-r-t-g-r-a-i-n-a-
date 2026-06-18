import type { MergeGateFreshnessVerdict } from "./merge-gate-freshness.js";

export type FinalizationTerminalDispatchRequest =
  | "merge"
  | "request_review"
  | "read_status"
  | "continue_embodiment"
  | "emit_blocker";

export type FinalizationTerminalDispatchAction =
  | "dispatch_merge_command"
  | "emit_exact_external_blocker"
  | "block_stale_merge_gate"
  | "block_unadmitted_merge_gate"
  | "block_missing_dispatch_id"
  | "block_replayed_dispatch_id"
  | "block_weaker_terminal_dispatch";

export interface FinalizationTerminalDispatchInput {
  merge_gate: MergeGateFreshnessVerdict;
  live_head_sha: string;
  requested_action: FinalizationTerminalDispatchRequest;
  dispatch_id: string;
  spent_dispatch_ids: string[];
  exact_blocker?: string;
}

export interface FinalizationTerminalDispatchCommand {
  dispatch_id: string;
  operation: "compile_merge_command";
  repository_full_name: string;
  pr_number: number;
  branch: string;
  expected_head_sha: string;
  source_gate_id: string;
  forbidden_fallbacks: string[];
}

export interface FinalizationTerminalDispatchVerdict {
  ok: boolean;
  action: FinalizationTerminalDispatchAction;
  command: FinalizationTerminalDispatchCommand | null;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function evidence(input: FinalizationTerminalDispatchInput): string[] {
  return [
    `requested action ${input.requested_action}`,
    `merge gate action ${input.merge_gate.action}`,
    `merge gate head ${input.merge_gate.head_sha}`,
    `live head ${input.live_head_sha}`,
  ];
}

function block(
  input: FinalizationTerminalDispatchInput,
  action: Exclude<FinalizationTerminalDispatchAction, "dispatch_merge_command" | "emit_exact_external_blocker">,
  blockers: string[],
  nextRoute: string,
  extraEvidence: string[] = [],
): FinalizationTerminalDispatchVerdict {
  return {
    ok: false,
    action,
    command: null,
    head_sha: input.live_head_sha,
    decisive_evidence: [...evidence(input), ...extraEvidence],
    blockers,
    next_route: nextRoute,
  };
}

function validDispatchId(input: FinalizationTerminalDispatchInput): string | null {
  const dispatchId = input.dispatch_id.trim();
  return dispatchId.length > 0 ? dispatchId : null;
}

export function compileFinalizationTerminalDispatch(
  input: FinalizationTerminalDispatchInput,
): FinalizationTerminalDispatchVerdict {
  const exactBlocker = input.exact_blocker?.trim();

  if (input.requested_action === "emit_blocker") {
    if (!exactBlocker) {
      return block(
        input,
        "block_unadmitted_merge_gate",
        ["terminal blocker dispatch has no exact blocker text"],
        "name the exact external blocker or choose merge dispatch from a fresh gate",
      );
    }

    return {
      ok: true,
      action: "emit_exact_external_blocker",
      command: null,
      head_sha: input.live_head_sha,
      decisive_evidence: [...evidence(input), exactBlocker],
      blockers: [exactBlocker],
      next_route: "remove the named external blocker before compiling terminal dispatch again",
    };
  }

  const dispatchId = validDispatchId(input);
  if (!dispatchId) {
    return block(
      input,
      "block_missing_dispatch_id",
      ["terminal dispatch has no durable dispatch id"],
      "compile terminal dispatch with a durable id before release",
    );
  }

  if (input.spent_dispatch_ids.includes(dispatchId)) {
    return block(
      input,
      "block_replayed_dispatch_id",
      [`terminal dispatch id already spent: ${dispatchId}`],
      "compile a new terminal dispatch id from fresh live-head gate evidence",
      [dispatchId],
    );
  }

  if (input.merge_gate.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_merge_gate",
      [`merge gate head ${input.merge_gate.head_sha} is not live head ${input.live_head_sha}`],
      "discard this gate and rebuild terminal dispatch from the moved PR head",
      [dispatchId],
    );
  }

  if (!input.merge_gate.ok || input.merge_gate.action !== "admit_fresh_merge_gate" || !input.merge_gate.gate_id) {
    return block(
      input,
      "block_unadmitted_merge_gate",
      [...input.merge_gate.blockers, `merge gate action is ${input.merge_gate.action}, not admit_fresh_merge_gate`],
      "resolve live-head review, status, or merge-readiness blockers before terminal dispatch",
      [dispatchId],
    );
  }

  if (input.requested_action !== "merge") {
    return block(
      input,
      "block_weaker_terminal_dispatch",
      [`fresh merge gate ${input.merge_gate.gate_id} admits merge; ${input.requested_action} would repeat a weaker route class`],
      "dispatch the guarded merge command or emit a new exact external blocker; do not fall back to comments, rereads, or extra embodiment",
      [dispatchId, input.merge_gate.gate_id],
    );
  }

  const command: FinalizationTerminalDispatchCommand = {
    dispatch_id: dispatchId,
    operation: "compile_merge_command",
    repository_full_name: input.merge_gate.repository_full_name,
    pr_number: input.merge_gate.pr_number,
    branch: input.merge_gate.branch,
    expected_head_sha: input.live_head_sha,
    source_gate_id: input.merge_gate.gate_id,
    forbidden_fallbacks: [
      "duplicate_comment",
      "metadata_reread",
      "duplicate_status_summary",
      "stale_repaired_head_status",
      "local_memory_guard",
      "extra_embodiment_after_fresh_merge_gate",
    ],
  };

  return {
    ok: true,
    action: "dispatch_merge_command",
    command,
    head_sha: input.live_head_sha,
    decisive_evidence: [
      ...evidence(input),
      dispatchId,
      input.merge_gate.gate_id,
      ...input.merge_gate.decisive_evidence,
    ],
    blockers: [],
    next_route: "compile and execute the guarded GitHub merge command only while the PR head still matches expected_head_sha",
  };
}
