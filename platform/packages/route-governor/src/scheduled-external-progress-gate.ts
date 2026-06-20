export type ScheduledExternalProgressIntent =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "repaired_head_blocker"
  | "warning_maintenance"
  | "local_memory_guard";

export type ScheduledExternalProgressGateAction =
  | "admit_external_platform_embodiment"
  | "admit_fresh_status_readback"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_missing_live_head"
  | "block_stale_repaired_head_reuse"
  | "block_non_progress_intent"
  | "block_incomplete_external_embodiment"
  | "block_incomplete_status_readback"
  | "block_missing_exact_blocker";

export interface ScheduledExternalStatusEvidence {
  surface_id: string;
  head_sha: string;
  evidence: string[];
}

export interface ScheduledExternalProgressCandidate {
  intent: ScheduledExternalProgressIntent;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  status_surface_ids: string[];
  new_check_run_ids: string[];
  status_evidence?: ScheduledExternalStatusEvidence[];
  blocker?: string;
}

export interface ScheduledExternalProgressGateInput {
  active_branch: string;
  expected_branch: string;
  prompt_head_sha: string;
  live_head_sha?: string;
  previous_status_head_sha?: string;
  resolved_repaired_head_sha: string;
  repaired_head_blocker_resolved: boolean;
  candidate: ScheduledExternalProgressCandidate;
}

export interface ScheduledExternalProgressGateVerdict {
  ok: boolean;
  action: ScheduledExternalProgressGateAction;
  branch: string;
  head_sha: string | null;
  quarantined_prompt_head_sha: string | null;
  admitted_progress_class: "external_platform_embodiment" | "fresh_status_readback" | "exact_external_blocker" | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_INTENTS = new Set<ScheduledExternalProgressIntent>([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "repaired_head_blocker",
  "warning_maintenance",
  "local_memory_guard",
]);

function executableBehaviorPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    /\.(ts|js|mjs|json)$/.test(path) &&
    !/(?:\.test|-proof)\.ts$/.test(path) &&
    !path.endsWith("/package.json") &&
    !path.endsWith("/src/index.ts")
  );
}

function base(input: ScheduledExternalProgressGateInput): Pick<
  ScheduledExternalProgressGateVerdict,
  "branch" | "head_sha" | "quarantined_prompt_head_sha"
> {
  const liveHead = input.live_head_sha ?? null;
  return {
    branch: input.active_branch,
    head_sha: liveHead,
    quarantined_prompt_head_sha: liveHead && input.prompt_head_sha !== liveHead ? input.prompt_head_sha : null,
  };
}

function block(
  input: ScheduledExternalProgressGateInput,
  action: Exclude<
    ScheduledExternalProgressGateAction,
    "admit_external_platform_embodiment" | "admit_fresh_status_readback" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ScheduledExternalProgressGateVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_progress_class: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function repairedHeadIsBeingReused(input: ScheduledExternalProgressGateInput): boolean {
  return (
    input.repaired_head_blocker_resolved &&
    (input.candidate.intent === "repaired_head_blocker" ||
      input.candidate.blocker?.includes(input.resolved_repaired_head_sha) === true ||
      input.candidate.status_surface_ids.some((surface) => surface.includes(input.resolved_repaired_head_sha)) ||
      (input.candidate.status_evidence ?? []).some((surface) => surface.head_sha === input.resolved_repaired_head_sha))
  );
}

function currentHeadStatusEvidence(input: ScheduledExternalProgressGateInput): ScheduledExternalStatusEvidence[] {
  return (input.candidate.status_evidence ?? []).filter((surface) => surface.head_sha === input.live_head_sha);
}

function staleStatusEvidence(input: ScheduledExternalProgressGateInput): ScheduledExternalStatusEvidence[] {
  return (input.candidate.status_evidence ?? []).filter((surface) => surface.head_sha !== input.live_head_sha);
}

function flattenStatusEvidence(evidence: ScheduledExternalStatusEvidence[]): string[] {
  return evidence.flatMap((surface) => [surface.surface_id, `status head ${surface.head_sha}`, ...surface.evidence]);
}

export function gateScheduledExternalProgress(
  input: ScheduledExternalProgressGateInput,
): ScheduledExternalProgressGateVerdict {
  if (input.active_branch !== input.expected_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`active branch ${input.active_branch} does not match expected branch ${input.expected_branch}`],
      "bind scheduled progress to the active manifestation branch before release",
    );
  }

  if (!input.live_head_sha) {
    return block(
      input,
      "block_missing_live_head",
      ["scheduled progress has no live PR head"],
      "read live PR metadata before trusting prompt, memory, or repaired-head evidence",
    );
  }

  if (repairedHeadIsBeingReused(input)) {
    return block(
      input,
      "block_stale_repaired_head_reuse",
      [`resolved repaired-head authority cannot be reused for ${input.resolved_repaired_head_sha}`],
      "route only from the live PR head with a new embodiment, fresh readback, or exact live-head blocker",
      [`live head ${input.live_head_sha}`, `resolved repaired head ${input.resolved_repaired_head_sha}`],
    );
  }

  if (NON_PROGRESS_INTENTS.has(input.candidate.intent)) {
    return block(
      input,
      "block_non_progress_intent",
      [`scheduled progress intent is non-progress: ${input.candidate.intent}`],
      "choose external embodiment, fresh live-head readback, or one exact live-head blocker",
    );
  }

  if (input.candidate.intent === "external_platform_embodiment") {
    const blockers: string[] = [];
    if (input.candidate.base_head_sha !== input.live_head_sha) {
      blockers.push(`embodiment base ${input.candidate.base_head_sha} is not live head ${input.live_head_sha}`);
    }
    if (!input.candidate.changed_files.some(executableBehaviorPath)) {
      blockers.push("external embodiment must change a behavior-bearing platform file");
    }
    if (input.candidate.executable_artifacts.length === 0) {
      blockers.push("external embodiment has no executable artifact");
    }
    if (input.candidate.routing_artifacts.length === 0) {
      blockers.push("external embodiment has no future-routing artifact");
    }

    if (blockers.length > 0) {
      return block(
        input,
        "block_incomplete_external_embodiment",
        blockers,
        "supply a live-head behavior-bearing platform write before counting scheduled progress",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_external_platform_embodiment",
      admitted_progress_class: "external_platform_embodiment",
      decisive_evidence: [
        `live head ${input.live_head_sha}`,
        ...input.candidate.changed_files.filter(executableBehaviorPath),
        ...input.candidate.executable_artifacts,
        ...input.candidate.routing_artifacts,
      ],
      blockers: [],
      next_route: "commit the scheduled embodiment, then require status only for the moved post-write head",
    };
  }

  if (input.candidate.intent === "fresh_status_readback") {
    const staleEvidence = staleStatusEvidence(input);
    if (staleEvidence.length > 0) {
      return block(
        input,
        "block_incomplete_status_readback",
        staleEvidence.map((surface) => `status surface ${surface.surface_id} is bound to ${surface.head_sha}, not ${input.live_head_sha}`),
        "discard stale status evidence and attach only live-head-bound status evidence",
        flattenStatusEvidence(staleEvidence),
      );
    }

    const liveEvidence = currentHeadStatusEvidence(input);
    const headMovedSinceStatus = input.previous_status_head_sha !== input.live_head_sha;
    const hasCurrentHeadStatusSurface = liveEvidence.length > 0;
    const hasNewCheckRuns = input.candidate.new_check_run_ids.length > 0;

    if (input.candidate.status_surface_ids.length > 0 && !hasCurrentHeadStatusSurface) {
      return block(
        input,
        "block_incomplete_status_readback",
        ["fresh status readback supplied opaque status ids without live-head evidence"],
        "replace opaque status ids with status_evidence entries bound to the live PR head",
        input.candidate.status_surface_ids,
      );
    }

    if (!headMovedSinceStatus && !hasNewCheckRuns) {
      return block(
        input,
        "block_incomplete_status_readback",
        ["fresh status readback requires a moved head or new current-head checks"],
        "do not count duplicate status summaries as scheduled progress",
      );
    }

    if (!hasCurrentHeadStatusSurface && !hasNewCheckRuns) {
      return block(
        input,
        "block_incomplete_status_readback",
        ["fresh status readback has no live-head status surface or new check run id"],
        "attach direct live-head status evidence before counting readback progress",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_fresh_status_readback",
      admitted_progress_class: "fresh_status_readback",
      decisive_evidence: [
        `live head ${input.live_head_sha}`,
        ...(input.previous_status_head_sha ? [`previous status head ${input.previous_status_head_sha}`] : []),
        ...flattenStatusEvidence(liveEvidence),
        ...input.candidate.new_check_run_ids.map((id) => `new check run ${id}`),
      ],
      blockers: [],
      next_route: "consume the fresh live-head status surface once, then choose a non-repeated embodiment or exact blocker",
    };
  }

  const blocker = input.candidate.blocker?.trim();
  if (!blocker) {
    return block(
      input,
      "block_missing_exact_blocker",
      ["exact external blocker intent has no blocker text"],
      "name one exact live-head external blocker or choose a stronger scheduled progress class",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "emit_exact_external_blocker",
    admitted_progress_class: "exact_external_blocker",
    decisive_evidence: [`live head ${input.live_head_sha}`, blocker],
    blockers: [blocker],
    next_route: "remove the exact live-head blocker before another scheduled progress class is admitted",
  };
}
