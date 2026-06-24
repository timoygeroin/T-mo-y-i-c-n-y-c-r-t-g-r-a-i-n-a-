export type ManifestationSourceKind =
  | "live_pr_metadata"
  | "workflow_status_readback"
  | "public_checks_summary"
  | "blocker_issue"
  | "prompt_carried_head"
  | "pr_body_summary";

export type ManifestationStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type ManifestationSourceArbitrationAction =
  | "continue_from_live_head"
  | "require_live_head_status"
  | "repair_live_head_failure"
  | "wait_for_live_head_checks"
  | "block_repaired_head_resurrection"
  | "block_source_conflict";

export interface ManifestationSourceSurface {
  kind: ManifestationSourceKind;
  head_sha?: string;
  branch?: string;
  verdict?: ManifestationStatusVerdict;
  evidence_id: string;
  evidence: string;
}

export interface ManifestationSourceArbitrationInput {
  active_branch: string;
  live_pr_branch: string;
  prompt_head_sha: string;
  live_pr_head_sha: string;
  resolved_repaired_head_sha: string;
  repaired_head_status_resolved: boolean;
  blocker_issue_state: "open" | "closed";
  blocker_label_present: boolean;
  attempted_blocker?: "old_repaired_head_blocker" | "current_head_status_blocker" | "current_head_failure";
  sources: ManifestationSourceSurface[];
}

export interface ManifestationSourceArbitrationVerdict {
  ok: boolean;
  action: ManifestationSourceArbitrationAction;
  branch: string;
  head_sha: string;
  selected_source: ManifestationSourceSurface | null;
  prompt_head_allowed: boolean;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const STATUS_SOURCE_KINDS = new Set<ManifestationSourceKind>(["workflow_status_readback", "public_checks_summary"]);

function sourceLabel(source: ManifestationSourceSurface): string {
  return `${source.kind}:${source.evidence_id}${source.head_sha ? `@${source.head_sha}` : ""}`;
}

function liveHeadStatusSources(input: ManifestationSourceArbitrationInput): ManifestationSourceSurface[] {
  return input.sources.filter(
    (source) => STATUS_SOURCE_KINDS.has(source.kind) && source.head_sha === input.live_pr_head_sha && source.verdict,
  );
}

function staleStatusSources(input: ManifestationSourceArbitrationInput): ManifestationSourceSurface[] {
  return input.sources.filter(
    (source) => STATUS_SOURCE_KINDS.has(source.kind) && Boolean(source.head_sha) && source.head_sha !== input.live_pr_head_sha,
  );
}

function blockerClosed(input: ManifestationSourceArbitrationInput): boolean {
  return input.blocker_issue_state === "closed" && !input.blocker_label_present;
}

function liveHeadMovedPastPrompt(input: ManifestationSourceArbitrationInput): boolean {
  return input.live_pr_head_sha !== input.prompt_head_sha;
}

function repairedHeadResolvedAndSpent(input: ManifestationSourceArbitrationInput): boolean {
  return input.repaired_head_status_resolved && input.resolved_repaired_head_sha === input.prompt_head_sha;
}

export function arbitrateManifestationSources(
  input: ManifestationSourceArbitrationInput,
): ManifestationSourceArbitrationVerdict {
  const base = {
    branch: input.live_pr_branch,
    head_sha: input.live_pr_head_sha,
  };

  if (input.live_pr_branch !== input.active_branch) {
    return {
      ...base,
      ok: false,
      action: "block_source_conflict",
      selected_source: null,
      prompt_head_allowed: false,
      decisive_evidence: [],
      blockers: [`live PR branch ${input.live_pr_branch} does not match active branch ${input.active_branch}`],
      next_route: "rebind manifestation arbitration to the active PR branch before release",
    };
  }

  if (
    input.attempted_blocker === "old_repaired_head_blocker" &&
    repairedHeadResolvedAndSpent(input) &&
    blockerClosed(input)
  ) {
    return {
      ...base,
      ok: false,
      action: "block_repaired_head_resurrection",
      selected_source: null,
      prompt_head_allowed: false,
      decisive_evidence: [
        `resolved repaired head ${input.resolved_repaired_head_sha}`,
        "blocker issue closed and blocker label absent",
      ],
      blockers: [`old repaired-head blocker cannot be emitted for ${input.resolved_repaired_head_sha}`],
      next_route: "discard the repaired-head blocker and route through the live PR head source state",
    };
  }

  const liveStatus = liveHeadStatusSources(input)[0];
  if (liveStatus?.verdict === "failing") {
    return {
      ...base,
      ok: true,
      action: "repair_live_head_failure",
      selected_source: liveStatus,
      prompt_head_allowed: false,
      decisive_evidence: [sourceLabel(liveStatus), liveStatus.evidence],
      blockers: [],
      next_route: "repair only the live-head failure surfaced by the selected status source",
    };
  }

  if (liveStatus?.verdict === "pending") {
    return {
      ...base,
      ok: false,
      action: "wait_for_live_head_checks",
      selected_source: liveStatus,
      prompt_head_allowed: false,
      decisive_evidence: [sourceLabel(liveStatus)],
      blockers: [liveStatus.evidence],
      next_route: "wait for the selected live-head status source to complete",
    };
  }

  if (liveStatus?.verdict === "passing" || liveStatus?.verdict === "passing_with_warnings") {
    return {
      ...base,
      ok: true,
      action: "continue_from_live_head",
      selected_source: liveStatus,
      prompt_head_allowed: !liveHeadMovedPastPrompt(input),
      decisive_evidence: [
        ...(liveHeadMovedPastPrompt(input) ? [`live PR head supersedes prompt head ${input.prompt_head_sha}`] : []),
        sourceLabel(liveStatus),
        liveStatus.evidence,
      ],
      blockers: [],
      next_route: "choose a non-repeated executable embodiment and then require status for the new head",
    };
  }

  const liveMetadata = input.sources.find(
    (source) => source.kind === "live_pr_metadata" && source.head_sha === input.live_pr_head_sha,
  );

  if (liveHeadMovedPastPrompt(input)) {
    return {
      ...base,
      ok: true,
      action: "require_live_head_status",
      selected_source: liveMetadata ?? null,
      prompt_head_allowed: false,
      decisive_evidence: [
        `live PR head ${input.live_pr_head_sha} supersedes prompt-carried head ${input.prompt_head_sha}`,
        ...(liveMetadata ? [sourceLabel(liveMetadata)] : []),
      ],
      blockers: staleStatusSources(input).map(
        (source) => `stale status source ${sourceLabel(source)} cannot decide live head ${input.live_pr_head_sha}`,
      ),
      next_route: "obtain a Checks, Actions, or workflow-published status source for the live PR head",
    };
  }

  if (repairedHeadResolvedAndSpent(input) && blockerClosed(input)) {
    return {
      ...base,
      ok: true,
      action: "continue_from_live_head",
      selected_source: liveMetadata ?? null,
      prompt_head_allowed: true,
      decisive_evidence: [`prompt head ${input.prompt_head_sha} is live and repaired-head blocker is closed`],
      blockers: [],
      next_route: "choose a non-repeated executable embodiment or wait for new current-head checks",
    };
  }

  return {
    ...base,
    ok: false,
    action: "block_source_conflict",
    selected_source: liveMetadata ?? null,
    prompt_head_allowed: false,
    decisive_evidence: liveMetadata ? [sourceLabel(liveMetadata)] : [],
    blockers: ["no decisive live-head status, resolved repaired-head state, or actionable live-head blocker is available"],
    next_route: "supply live PR metadata plus a head-bound status source or exact blocker before release",
  };
}
