import type { ContinuationStatusReceiptSurface } from "./index.js";

export type PromptHeadReconciliationAction =
  | "accept_prompt_head"
  | "read_live_head_status"
  | "accept_live_head_after_status"
  | "wait_for_live_head_checks"
  | "repair_live_head_failure"
  | "block_stale_prompt_head"
  | "block_release";

export interface PromptHeadReconciliationInput {
  branch: string;
  active_branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  resolved_repaired_head_sha?: string;
  resolved_repaired_head_status?: boolean;
  prohibited_blockers: string[];
  attempted_blocker?: string;
  live_status_surface?: ContinuationStatusReceiptSurface;
}

export interface PromptHeadReconciliationVerdict {
  ok: boolean;
  action: PromptHeadReconciliationAction;
  branch: string;
  head_sha: string;
  prompt_head_allowed: boolean;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function statusBlockers(statusSurface: ContinuationStatusReceiptSurface): string[] {
  if (statusSurface.blocking_failures.length > 0) return statusSurface.blocking_failures;
  if (statusSurface.pending_surfaces.length > 0) return statusSurface.pending_surfaces;
  if (statusSurface.decisive_successes.length === 0) return ["live-head status surface returned no decisive success evidence"];
  return [];
}

function attemptedProhibitedBlocker(input: PromptHeadReconciliationInput): string | null {
  const attempted = input.attempted_blocker?.trim();
  if (!attempted) return null;
  return input.prohibited_blockers.find((blocker) => blocker === attempted) ?? null;
}

export function reconcilePromptHeadWithLiveHead(
  input: PromptHeadReconciliationInput,
): PromptHeadReconciliationVerdict {
  const warnings = input.live_status_surface?.non_blocking_warnings ?? [];
  const base = {
    branch: input.branch,
    head_sha: input.live_head_sha,
  };

  if (input.branch !== input.active_branch) {
    return {
      ...base,
      ok: false,
      action: "block_release",
      prompt_head_allowed: false,
      decisive_evidence: [],
      blockers: [`prompt head reconciliation branch ${input.branch} does not match active branch ${input.active_branch}`],
      warnings,
      next_route: "rebind prompt-head reconciliation to the active PR branch before release",
    };
  }

  const prohibited = attemptedProhibitedBlocker(input);
  if (prohibited) {
    return {
      ...base,
      ok: false,
      action: "block_stale_prompt_head",
      prompt_head_allowed: false,
      decisive_evidence: [`attempted prohibited blocker: ${prohibited}`],
      blockers: [`prohibited prompt-carried blocker cannot be emitted: ${prohibited}`],
      warnings,
      next_route: "discard the prohibited blocker and route through the live PR head",
    };
  }

  const promptHeadIsLive = input.prompt_head_sha === input.live_head_sha;

  if (!promptHeadIsLive && !input.live_status_surface) {
    return {
      ...base,
      ok: true,
      action: "read_live_head_status",
      prompt_head_allowed: false,
      decisive_evidence: [`PR head moved from prompt-carried ${input.prompt_head_sha} to live ${input.live_head_sha}`],
      blockers: [],
      warnings,
      next_route: "read the live PR head status before repeating any repaired-head claim or blocker",
    };
  }

  if (input.live_status_surface && !input.live_status_surface.ok) {
    const blockers = statusBlockers(input.live_status_surface);
    const hasPending = input.live_status_surface.pending_surfaces.length > 0;
    return {
      ...base,
      ok: false,
      action: hasPending ? "wait_for_live_head_checks" : "repair_live_head_failure",
      prompt_head_allowed: false,
      decisive_evidence: blockers,
      blockers,
      warnings,
      next_route: hasPending ? "wait for live-head checks to complete" : "repair the concrete live-head status failure",
    };
  }

  if (input.live_status_surface?.ok) {
    return {
      ...base,
      ok: true,
      action: promptHeadIsLive ? "accept_prompt_head" : "accept_live_head_after_status",
      prompt_head_allowed: promptHeadIsLive,
      decisive_evidence: input.live_status_surface.decisive_successes,
      blockers: [],
      warnings,
      next_route: promptHeadIsLive
        ? "continue only from the current prompt/live head after status evidence is attached"
        : "continue from the live PR head; do not reuse the stale prompt-carried head",
    };
  }

  if (
    promptHeadIsLive &&
    input.resolved_repaired_head_status &&
    input.resolved_repaired_head_sha === input.prompt_head_sha
  ) {
    return {
      ...base,
      ok: true,
      action: "accept_prompt_head",
      prompt_head_allowed: true,
      decisive_evidence: [`prompt head ${input.prompt_head_sha} is live and its repaired-head status is resolved`],
      blockers: [],
      warnings,
      next_route: "select a non-repeated executable embodiment class or read new current-head checks if they appear",
    };
  }

  return {
    ...base,
    ok: true,
    action: "read_live_head_status",
    prompt_head_allowed: false,
    decisive_evidence: [`live head ${input.live_head_sha} has no attached status surface`],
    blockers: [],
    warnings,
    next_route: "read the live PR head status before making a release or blocker claim",
  };
}
