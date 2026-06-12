import {
  enforceFinalizationTerminalProgress,
  type FinalizationTerminalProgressInput,
  type FinalizationTerminalProgressVerdict,
  type TerminalProgressAction,
  type TerminalProgressCandidate,
} from "./finalization-terminal-progress-contract.js";

export type TerminalProgressArbiterAction =
  | "select_terminal_progress"
  | "block_no_terminal_progress_candidate";

export interface TerminalProgressArbiterCandidate {
  candidate_id: string;
  candidate: TerminalProgressCandidate;
}

export interface RejectedTerminalProgressCandidate {
  candidate_id: string;
  action: TerminalProgressAction;
  blockers: string[];
  decisive_evidence: string[];
}

export interface SelectedTerminalProgressCandidate {
  candidate_id: string;
  action: Extract<
    TerminalProgressAction,
    "admit_external_embodiment" | "admit_fresh_status_readback" | "admit_exact_external_blocker"
  >;
  decisive_evidence: string[];
  next_route: string;
}

export interface TerminalProgressArbiterInput
  extends Omit<FinalizationTerminalProgressInput, "candidate"> {
  candidates: TerminalProgressArbiterCandidate[];
}

export interface TerminalProgressArbiterVerdict {
  ok: boolean;
  action: TerminalProgressArbiterAction;
  branch: string;
  head_sha: string;
  selected: SelectedTerminalProgressCandidate | null;
  rejected: RejectedTerminalProgressCandidate[];
  blockers: string[];
  quarantined_heads: string[];
  next_route: string;
}

const ACTION_PRIORITY: Record<SelectedTerminalProgressCandidate["action"], number> = {
  admit_external_embodiment: 3,
  admit_fresh_status_readback: 2,
  admit_exact_external_blocker: 1,
};

function selectableAction(
  action: TerminalProgressAction,
): action is SelectedTerminalProgressCandidate["action"] {
  return (
    action === "admit_external_embodiment" ||
    action === "admit_fresh_status_readback" ||
    action === "admit_exact_external_blocker"
  );
}

function evaluateCandidate(
  input: TerminalProgressArbiterInput,
  candidate: TerminalProgressArbiterCandidate,
): FinalizationTerminalProgressVerdict {
  return enforceFinalizationTerminalProgress({
    active_branch: input.active_branch,
    live_head_sha: input.live_head_sha,
    previous_status_head_sha: input.previous_status_head_sha,
    prohibited_progress_classes: input.prohibited_progress_classes,
    resolved_historical_heads: input.resolved_historical_heads,
    candidate: candidate.candidate,
  });
}

function union(values: string[]): string[] {
  return [...new Set(values)];
}

export function arbitrateTerminalProgress(
  input: TerminalProgressArbiterInput,
): TerminalProgressArbiterVerdict {
  const rejected: RejectedTerminalProgressCandidate[] = [];
  const selectable: SelectedTerminalProgressCandidate[] = [];
  const quarantinedHeads: string[] = [];

  for (const candidate of input.candidates) {
    const verdict = evaluateCandidate(input, candidate);
    quarantinedHeads.push(...verdict.quarantined_heads);

    if (!verdict.ok || !selectableAction(verdict.action)) {
      rejected.push({
        candidate_id: candidate.candidate_id,
        action: verdict.action,
        blockers: verdict.blockers,
        decisive_evidence: verdict.decisive_evidence,
      });
      continue;
    }

    selectable.push({
      candidate_id: candidate.candidate_id,
      action: verdict.action,
      decisive_evidence: verdict.decisive_evidence,
      next_route: verdict.next_route,
    });
  }

  selectable.sort((left, right) => {
    const priorityDelta = ACTION_PRIORITY[right.action] - ACTION_PRIORITY[left.action];
    if (priorityDelta !== 0) return priorityDelta;
    return right.decisive_evidence.length - left.decisive_evidence.length;
  });

  const selected = selectable[0] ?? null;
  if (!selected) {
    return {
      ok: false,
      action: "block_no_terminal_progress_candidate",
      branch: input.active_branch,
      head_sha: input.live_head_sha,
      selected: null,
      rejected,
      blockers: ["no terminal progress candidate survived arbitration"],
      quarantined_heads: union(quarantinedHeads),
      next_route: "supply one executable embodiment, legitimately fresh readback, or exact external blocker candidate",
    };
  }

  return {
    ok: true,
    action: "select_terminal_progress",
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    selected,
    rejected,
    blockers: [],
    quarantined_heads: union(quarantinedHeads),
    next_route:
      selected.action === "admit_external_embodiment"
        ? "commit the selected embodiment before spending the run on weaker readback or blocker candidates"
        : selected.next_route,
  };
}
