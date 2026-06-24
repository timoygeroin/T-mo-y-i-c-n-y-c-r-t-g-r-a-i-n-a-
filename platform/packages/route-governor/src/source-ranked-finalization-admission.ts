export type FinalizationHeadSourceTier =
  | "live_pr_metadata"
  | "current_instruction"
  | "workflow_status_readback"
  | "memory_receipt"
  | "archive_derived_receipt"
  | "model_summary";

export type SourceRankedFinalizationMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "old_repaired_head_blocker"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "local_memory_guard"
  | "guessed_future_ci";

export type SourceRankedFinalizationAction =
  | "admit_live_head_embodiment"
  | "admit_live_head_status_readback"
  | "admit_exact_external_blocker"
  | "block_stale_head_binding"
  | "block_repeated_non_progress"
  | "block_incomplete_embodiment"
  | "block_missing_head_source";

export interface FinalizationHeadSource {
  source_id: string;
  tier: FinalizationHeadSourceTier;
  head_sha: string;
  observed_at?: string;
}

export interface SourceRankedFinalizationAdmissionInput {
  active_branch: string;
  target_branch: string;
  candidate_class: SourceRankedFinalizationMoveClass;
  candidate_head_sha: string;
  prior_status_head_sha: string;
  head_sources: FinalizationHeadSource[];
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  artifact_class: string;
  spent_artifact_classes: string[];
  blocker_text?: string;
}

export interface SourceRankedFinalizationAdmissionVerdict {
  ok: boolean;
  action: SourceRankedFinalizationAction;
  branch: string;
  head_sha: string | null;
  controlling_source: FinalizationHeadSource | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const SOURCE_PRIORITY: Record<FinalizationHeadSourceTier, number> = {
  live_pr_metadata: 6,
  workflow_status_readback: 5,
  current_instruction: 4,
  memory_receipt: 3,
  archive_derived_receipt: 2,
  model_summary: 1,
};

const REPEATED_NON_PROGRESS = new Set<SourceRankedFinalizationMoveClass>([
  "old_repaired_head_blocker",
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "local_memory_guard",
  "guessed_future_ci",
]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function sourceWeight(source: FinalizationHeadSource): number {
  const observedAt = source.observed_at ? Date.parse(source.observed_at) || 0 : 0;
  return SOURCE_PRIORITY[source.tier] * 1_000_000_000_000_000 + observedAt;
}

function strongestHeadSource(sources: FinalizationHeadSource[]): FinalizationHeadSource | null {
  return [...sources]
    .filter((source) => source.head_sha.trim().length > 0)
    .sort((left, right) => sourceWeight(right) - sourceWeight(left))[0] ?? null;
}

function base(
  input: SourceRankedFinalizationAdmissionInput,
  controllingSource: FinalizationHeadSource | null,
): Pick<SourceRankedFinalizationAdmissionVerdict, "branch" | "head_sha" | "controlling_source"> {
  return {
    branch: input.target_branch,
    head_sha: controllingSource?.head_sha ?? null,
    controlling_source: controllingSource,
  };
}

function block(
  input: SourceRankedFinalizationAdmissionInput,
  controllingSource: FinalizationHeadSource | null,
  action: Exclude<
    SourceRankedFinalizationAction,
    "admit_live_head_embodiment" | "admit_live_head_status_readback" | "admit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
): SourceRankedFinalizationAdmissionVerdict {
  return {
    ...base(input, controllingSource),
    ok: false,
    action,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(input: SourceRankedFinalizationAdmissionInput): string[] {
  const blockers: string[] = [];

  if (input.target_branch !== input.active_branch) {
    blockers.push(`target branch ${input.target_branch} does not match active branch ${input.active_branch}`);
  }
  if (!input.changed_files.some(executablePlatformPath)) {
    blockers.push("source-ranked embodiment has no executable platform file change");
  }
  if (input.executable_artifacts.length === 0) {
    blockers.push("source-ranked embodiment has no executable artifact evidence");
  }
  if (input.routing_artifacts.length === 0) {
    blockers.push("source-ranked embodiment has no future-routing artifact evidence");
  }
  if (input.proof_artifacts.length === 0) {
    blockers.push("source-ranked embodiment has no proof artifact evidence");
  }
  if (!input.artifact_class.trim()) {
    blockers.push("source-ranked embodiment has no artifact class");
  }
  if (input.spent_artifact_classes.includes(input.artifact_class)) {
    blockers.push(`source-ranked embodiment repeats spent artifact class: ${input.artifact_class}`);
  }

  return blockers;
}

export function admitSourceRankedFinalizationMove(
  input: SourceRankedFinalizationAdmissionInput,
): SourceRankedFinalizationAdmissionVerdict {
  const controllingSource = strongestHeadSource(input.head_sources);

  if (!controllingSource) {
    return block(
      input,
      null,
      "block_missing_head_source",
      ["no grounded head source is available for finalization admission"],
      "obtain live PR metadata or a workflow status readback before choosing a finalization move",
    );
  }

  if (input.candidate_head_sha !== controllingSource.head_sha) {
    return block(
      input,
      controllingSource,
      "block_stale_head_binding",
      [
        `candidate is bound to ${input.candidate_head_sha}, but strongest head source ${controllingSource.source_id} reports ${controllingSource.head_sha}`,
      ],
      "discard lower-tier head binding and rebind the move to the strongest live PR head source",
    );
  }

  if (REPEATED_NON_PROGRESS.has(input.candidate_class)) {
    return block(
      input,
      controllingSource,
      "block_repeated_non_progress",
      [`candidate repeats prohibited non-progress class: ${input.candidate_class}`],
      "choose live-head embodiment, live-head status readback after movement, or one exact external blocker",
    );
  }

  if (input.candidate_class === "fresh_status_readback") {
    if (input.prior_status_head_sha === controllingSource.head_sha) {
      return block(
        input,
        controllingSource,
        "block_repeated_non_progress",
        [`status for ${controllingSource.head_sha} has already been read back`],
        "do not reread the same head; choose a non-repeated executable embodiment or exact blocker",
      );
    }

    return {
      ...base(input, controllingSource),
      ok: true,
      action: "admit_live_head_status_readback",
      decisive_evidence: [
        `${controllingSource.source_id}:${controllingSource.tier}:${controllingSource.head_sha}`,
        `prior status head ${input.prior_status_head_sha} differs from controlling head ${controllingSource.head_sha}`,
      ],
      blockers: [],
      next_route: "read only status surfaces bound to the source-ranked live PR head",
    };
  }

  if (input.candidate_class === "exact_external_blocker") {
    const blocker = input.blocker_text?.trim();
    if (!blocker) {
      return block(
        input,
        controllingSource,
        "block_incomplete_embodiment",
        ["exact external blocker has no blocker text"],
        "provide the exact blocker text or choose a live-head executable embodiment",
      );
    }

    return {
      ...base(input, controllingSource),
      ok: true,
      action: "admit_exact_external_blocker",
      decisive_evidence: [`${controllingSource.source_id}:${controllingSource.head_sha}`, blocker],
      blockers: [],
      next_route: "publish the exact source-ranked blocker and stop",
    };
  }

  const blockers = embodimentBlockers(input);
  if (blockers.length > 0) {
    return block(
      input,
      controllingSource,
      "block_incomplete_embodiment",
      blockers,
      "raise the source-ranked candidate to executable files, routing evidence, proof evidence, and a new artifact class",
    );
  }

  return {
    ...base(input, controllingSource),
    ok: true,
    action: "admit_live_head_embodiment",
    decisive_evidence: [
      `${controllingSource.source_id}:${controllingSource.tier}:${controllingSource.head_sha}`,
      input.artifact_class,
      ...input.changed_files.filter(executablePlatformPath),
      ...input.executable_artifacts,
      ...input.routing_artifacts,
      ...input.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the source-ranked embodiment, then require status readback for the resulting new PR head",
  };
}
