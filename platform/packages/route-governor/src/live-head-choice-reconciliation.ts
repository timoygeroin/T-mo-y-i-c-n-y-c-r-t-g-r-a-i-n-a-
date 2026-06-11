import { chooseNextEmbodiment, type EmbodimentChoiceCandidate, type EmbodimentChoiceRejection } from "./embodiment-choice-kernel.js";

export type ChoiceHeadSourceKind =
  | "prompt"
  | "pr_body_summary"
  | "live_pr_metadata"
  | "actions_readback"
  | "public_checks_page";

export type ChoiceHeadStatus = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export interface ChoiceHeadSource {
  source_id: string;
  kind: ChoiceHeadSourceKind;
  head_sha: string;
  status?: ChoiceHeadStatus;
  evidence: string[];
}

export type LiveHeadChoiceAction =
  | "select_executable_embodiment"
  | "read_live_head_status"
  | "repair_live_head_failure"
  | "block_no_live_head"
  | "block_no_candidate";

export interface LiveHeadChoiceInput {
  branch: string;
  active_branch: string;
  live_head_sha: string;
  last_repaired_head_sha: string;
  exhausted_move_classes: string[];
  sources: ChoiceHeadSource[];
  candidates: EmbodimentChoiceCandidate[];
}

export interface LiveHeadChoiceVerdict {
  ok: boolean;
  action: LiveHeadChoiceAction;
  branch: string;
  head_sha: string;
  selected_candidate_id: string | null;
  stale_source_ids: string[];
  rejected: EmbodimentChoiceRejection[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const DIRECT_STATUS_KINDS = new Set<ChoiceHeadSourceKind>(["actions_readback", "public_checks_page"]);

function liveSource(input: LiveHeadChoiceInput): ChoiceHeadSource | undefined {
  return input.sources.find((source) => source.kind === "live_pr_metadata" && source.head_sha === input.live_head_sha);
}

function liveStatusSources(input: LiveHeadChoiceInput): ChoiceHeadSource[] {
  return input.sources.filter(
    (source) => DIRECT_STATUS_KINDS.has(source.kind) && source.head_sha === input.live_head_sha && Boolean(source.status),
  );
}

function staleSourceIds(input: LiveHeadChoiceInput): string[] {
  return input.sources
    .filter((source) => source.head_sha !== input.live_head_sha || source.kind === "prompt" || source.kind === "pr_body_summary")
    .map((source) => source.source_id);
}

function base(input: LiveHeadChoiceInput): Pick<LiveHeadChoiceVerdict, "branch" | "head_sha" | "stale_source_ids"> {
  return {
    branch: input.branch,
    head_sha: input.live_head_sha,
    stale_source_ids: staleSourceIds(input),
  };
}

export function reconcileLiveHeadEmbodimentChoice(input: LiveHeadChoiceInput): LiveHeadChoiceVerdict {
  const live = liveSource(input);
  if (input.branch !== input.active_branch || !live) {
    return {
      ...base(input),
      ok: false,
      action: "block_no_live_head",
      selected_candidate_id: null,
      rejected: [],
      decisive_evidence: [],
      blockers: [
        ...(input.branch !== input.active_branch
          ? [`branch ${input.branch} does not match active branch ${input.active_branch}`]
          : []),
        ...(!live ? [`no live PR metadata source is attached for ${input.live_head_sha}`] : []),
      ],
      next_route: "attach live PR metadata before choosing between status readback and embodiment",
    };
  }

  const liveStatuses = liveStatusSources(input);
  const liveFailure = liveStatuses.find((source) => source.status === "failing");
  if (liveFailure) {
    return {
      ...base(input),
      ok: false,
      action: "repair_live_head_failure",
      selected_candidate_id: null,
      rejected: [],
      decisive_evidence: liveFailure.evidence,
      blockers: liveFailure.evidence.length > 0 ? liveFailure.evidence : [`live head ${input.live_head_sha} is failing`],
      next_route: "repair only the live-head-bound failure before selecting another embodiment increment",
    };
  }

  const livePending = liveStatuses.find((source) => source.status === "pending" || source.status === "unknown");
  if (livePending) {
    return {
      ...base(input),
      ok: false,
      action: "read_live_head_status",
      selected_candidate_id: null,
      rejected: [],
      decisive_evidence: livePending.evidence,
      blockers: livePending.evidence.length > 0 ? livePending.evidence : [`live head status is ${livePending.status}`],
      next_route: "wait for the live-head status surface to finish before another release claim",
    };
  }

  const choice = chooseNextEmbodiment({
    branch: input.branch,
    live_head_sha: input.live_head_sha,
    last_repaired_head_sha: input.last_repaired_head_sha,
    exhausted_move_classes: input.exhausted_move_classes,
    candidates: input.candidates,
  });

  if (!choice.selected) {
    return {
      ...base(input),
      ok: false,
      action: "block_no_candidate",
      selected_candidate_id: null,
      rejected: choice.rejected,
      decisive_evidence: live.evidence,
      blockers: ["no executable embodiment candidate survived live-head choice reconciliation"],
      next_route: "supply a non-repeated executable platform embodiment candidate or a live-head status surface",
    };
  }

  const acceptedStatus = liveStatuses.find(
    (source) => source.status === "passing" || source.status === "passing_with_warnings",
  );

  return {
    ...base(input),
    ok: true,
    action: acceptedStatus ? "read_live_head_status" : "select_executable_embodiment",
    selected_candidate_id: choice.selected.candidate_id,
    rejected: choice.rejected,
    decisive_evidence: [
      ...live.evidence,
      ...(acceptedStatus?.evidence ?? []),
      ...choice.selected.decisive_evidence,
    ],
    blockers: [],
    next_route: acceptedStatus
      ? "continue from the live-head status surface, then select the next non-repeated embodiment"
      : "commit the selected executable embodiment and require status readback for the moved head",
  };
}
