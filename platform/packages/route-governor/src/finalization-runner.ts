import {
  compileFinalizationProgressContract,
  type FinalizationProgressAction,
  type FinalizationProgressInput,
  type FinalizationProgressVerdict,
} from "./finalization-progress-contract.js";

export type ScheduledFinalizationEmissionClass =
  | "external_embodiment"
  | "live_head_status_readback"
  | "exact_external_blocker"
  | "blocked_non_progress"
  | "blocked_incomplete_progress";

export type ScheduledFinalizationDeliveryTarget = "github_pr" | "issue_comment" | "chat" | "artifact";

export interface ScheduledFinalizationRunnerInput {
  progress: FinalizationProgressInput;
  run_id?: string;
  delivery_target?: ScheduledFinalizationDeliveryTarget;
}

export interface ScheduledFinalizationRunnerOutput {
  ok: boolean;
  emission_class: ScheduledFinalizationEmissionClass;
  exit_code: 0 | 1 | 78;
  branch: string;
  head_sha: string;
  delivery_target: ScheduledFinalizationDeliveryTarget;
  run_id?: string;
  summary: string;
  payload: {
    action: FinalizationProgressAction;
    decisive_evidence: string[];
    blockers: string[];
    next_route: string;
  };
}

function emissionClass(verdict: FinalizationProgressVerdict): ScheduledFinalizationEmissionClass {
  switch (verdict.action) {
    case "commit_executable_embodiment":
      return "external_embodiment";
    case "read_live_head_status":
      return "live_head_status_readback";
    case "emit_exact_external_blocker":
      return "exact_external_blocker";
    case "block_non_progress":
      return "blocked_non_progress";
    case "block_incomplete_progress":
      return "blocked_incomplete_progress";
  }
}

function exitCode(verdict: FinalizationProgressVerdict): 0 | 1 | 78 {
  if (verdict.ok) return 0;
  return verdict.action === "block_non_progress" ? 78 : 1;
}

function summaryFor(verdict: FinalizationProgressVerdict, emission: ScheduledFinalizationEmissionClass): string {
  if (verdict.ok) {
    return `${emission} accepted for ${verdict.branch} at ${verdict.head_sha}: ${verdict.next_route}`;
  }

  const blockerText = verdict.blockers.length > 0 ? verdict.blockers.join("; ") : "no blocker detail surfaced";
  return `${emission} for ${verdict.branch} at ${verdict.head_sha}: ${blockerText}`;
}

export function compileScheduledFinalizationRunner(
  input: ScheduledFinalizationRunnerInput,
): ScheduledFinalizationRunnerOutput {
  const verdict = compileFinalizationProgressContract(input.progress);
  const emission = emissionClass(verdict);

  return {
    ok: verdict.ok,
    emission_class: emission,
    exit_code: exitCode(verdict),
    branch: verdict.branch,
    head_sha: verdict.head_sha,
    delivery_target: input.delivery_target ?? "artifact",
    run_id: input.run_id,
    summary: summaryFor(verdict, emission),
    payload: {
      action: verdict.action,
      decisive_evidence: verdict.decisive_evidence,
      blockers: verdict.blockers,
      next_route: verdict.next_route,
    },
  };
}
