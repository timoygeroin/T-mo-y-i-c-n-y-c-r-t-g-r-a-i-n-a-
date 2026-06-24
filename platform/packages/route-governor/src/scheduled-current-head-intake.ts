export type ScheduledHeadSourceKind =
  | "current_user_instruction"
  | "scheduled_prompt"
  | "pr_metadata"
  | "pr_body"
  | "status_readback"
  | "connector_readback";

export type ScheduledHeadSourceTier = "direct_current" | "direct_external" | "historical_external" | "derived_body";

export type ScheduledCurrentHeadProgressClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "repaired_head_blocker";

export type ScheduledCurrentHeadIntakeAction =
  | "admit_external_embodiment"
  | "admit_moved_head_status_readback"
  | "admit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_no_live_head"
  | "block_repaired_head_reuse"
  | "block_non_progress_class"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker"
  | "block_stale_status_readback";

export interface ScheduledHeadSource {
  source_id: string;
  kind: ScheduledHeadSourceKind;
  tier: ScheduledHeadSourceTier;
  branch: string;
  head_sha?: string;
  evidence: string[];
}

export interface ScheduledEmbodimentCandidate {
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
}

export interface ScheduledCurrentHeadIntakeInput {
  active_branch: string;
  expected_branch: string;
  live_head_sha?: string;
  previous_status_head_sha?: string;
  resolved_historical_heads: string[];
  requested_progress_class: ScheduledCurrentHeadProgressClass;
  sources: ScheduledHeadSource[];
  embodiment_candidate?: ScheduledEmbodimentCandidate;
  blocker?: string;
}

export interface ScheduledCurrentHeadIntakeVerdict {
  ok: boolean;
  action: ScheduledCurrentHeadIntakeAction;
  branch: string;
  live_head_sha: string | null;
  authoritative_source_ids: string[];
  demoted_source_ids: string[];
  quarantined_heads: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<ScheduledCurrentHeadProgressClass>([
  "metadata_reread",
  "duplicate_ci_summary",
]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function liveSources(input: ScheduledCurrentHeadIntakeInput): ScheduledHeadSource[] {
  return input.sources.filter(
    (source) =>
      Boolean(input.live_head_sha) &&
      source.branch === input.active_branch &&
      source.head_sha === input.live_head_sha &&
      (source.tier === "direct_external" || source.tier === "direct_current"),
  );
}

function demotedSources(input: ScheduledCurrentHeadIntakeInput): ScheduledHeadSource[] {
  return input.sources.filter(
    (source) =>
      source.branch !== input.active_branch ||
      (Boolean(source.head_sha) && Boolean(input.live_head_sha) && source.head_sha !== input.live_head_sha),
  );
}

function quarantinedHeads(input: ScheduledCurrentHeadIntakeInput): string[] {
  const heads = new Set<string>();

  for (const head of input.resolved_historical_heads) {
    if (head && head !== input.live_head_sha) heads.add(head);
  }

  if (input.previous_status_head_sha && input.previous_status_head_sha !== input.live_head_sha) {
    heads.add(input.previous_status_head_sha);
  }

  for (const source of demotedSources(input)) {
    if (source.head_sha && source.head_sha !== input.live_head_sha) heads.add(source.head_sha);
  }

  return [...heads];
}

function base(input: ScheduledCurrentHeadIntakeInput): Pick<
  ScheduledCurrentHeadIntakeVerdict,
  "branch" | "live_head_sha" | "authoritative_source_ids" | "demoted_source_ids" | "quarantined_heads"
> {
  return {
    branch: input.active_branch,
    live_head_sha: input.live_head_sha ?? null,
    authoritative_source_ids: liveSources(input).map((source) => source.source_id),
    demoted_source_ids: demotedSources(input).map((source) => source.source_id),
    quarantined_heads: quarantinedHeads(input),
  };
}

function block(
  input: ScheduledCurrentHeadIntakeInput,
  action: Exclude<
    ScheduledCurrentHeadIntakeAction,
    "admit_external_embodiment" | "admit_moved_head_status_readback" | "admit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ScheduledCurrentHeadIntakeVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(candidate: ScheduledEmbodimentCandidate | undefined, liveHeadSha: string): string[] {
  if (!candidate) return ["external embodiment class has no embodiment candidate"];

  const blockers: string[] = [];
  if (candidate.base_head_sha !== liveHeadSha) {
    blockers.push(`embodiment base ${candidate.base_head_sha} is not live head ${liveHeadSha}`);
  }
  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("embodiment candidate changes no executable platform file");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("embodiment candidate has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("embodiment candidate has no future-routing artifact evidence");
  }

  return blockers;
}

export function intakeScheduledCurrentHead(input: ScheduledCurrentHeadIntakeInput): ScheduledCurrentHeadIntakeVerdict {
  if (input.active_branch !== input.expected_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`active branch ${input.active_branch} does not match expected branch ${input.expected_branch}`],
      "bind scheduled finalization to the active manifestation branch",
    );
  }

  if (!input.live_head_sha) {
    return block(
      input,
      "block_no_live_head",
      ["scheduled finalization has no connector live PR head"],
      "read PR metadata through a live external source before choosing terminal progress",
    );
  }

  if (input.requested_progress_class === "repaired_head_blocker") {
    return block(
      input,
      "block_repaired_head_reuse",
      input.resolved_historical_heads.map((head) => `resolved repaired head cannot be reused as live blocker: ${head}`),
      "discard resolved historical heads and route from the live PR head only",
      quarantinedHeads(input).map((head) => `quarantined historical head ${head}`),
    );
  }

  if (NON_PROGRESS_CLASSES.has(input.requested_progress_class)) {
    return block(
      input,
      "block_non_progress_class",
      [`scheduled finalization requested non-progress class: ${input.requested_progress_class}`],
      "choose executable embodiment, moved-head status readback, or exact external blocker",
      [input.requested_progress_class],
    );
  }

  if (input.requested_progress_class === "external_platform_embodiment") {
    const blockers = embodimentBlockers(input.embodiment_candidate, input.live_head_sha);
    if (blockers.length > 0) {
      return block(
        input,
        "block_incomplete_embodiment",
        blockers,
        "supply an embodiment candidate based on the live head with executable and routing evidence",
      );
    }

    const candidate = input.embodiment_candidate;
    if (!candidate) {
      return block(
        input,
        "block_incomplete_embodiment",
        ["external embodiment class has no embodiment candidate"],
        "supply an embodiment candidate based on the live head with executable and routing evidence",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_external_embodiment",
      decisive_evidence: [
        `live head ${input.live_head_sha}`,
        ...liveSources(input).flatMap((source) => [source.source_id, ...source.evidence]),
        ...candidate.changed_files.filter(executablePlatformPath),
        ...candidate.executable_artifacts,
        ...candidate.routing_artifacts,
      ],
      blockers: [],
      next_route: "commit the executable embodiment, then read only status for the resulting moved head",
    };
  }

  if (input.requested_progress_class === "fresh_status_readback") {
    if (input.previous_status_head_sha === input.live_head_sha) {
      return block(
        input,
        "block_stale_status_readback",
        [`status readback for ${input.live_head_sha} is not fresh without new check evidence`],
        "do not publish another readback until the head moves or new live-head checks appear",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_moved_head_status_readback",
      decisive_evidence: [
        `status head moved from ${input.previous_status_head_sha ?? "<none>"} to ${input.live_head_sha}`,
        ...liveSources(input).flatMap((source) => [source.source_id, ...source.evidence]),
      ],
      blockers: [],
      next_route: "obtain a direct status readback for the live PR head; do not replay repaired-head status",
    };
  }

  const blocker = input.blocker?.trim();
  if (!blocker) {
    return block(
      input,
      "block_missing_exact_blocker",
      ["exact external blocker class has no blocker text"],
      "name the exact external blocker or choose a valid embodiment/readback route",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_exact_external_blocker",
    decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
    blockers: [blocker],
    next_route: "remove the named blocker before attempting another terminal progress class",
  };
}
