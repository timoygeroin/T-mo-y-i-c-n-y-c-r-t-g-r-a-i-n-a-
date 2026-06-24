export type FinalizationRunMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker";

export type FinalizationRunSourceTier =
  | "direct_current_instruction"
  | "live_pr_metadata"
  | "direct_status_surface"
  | "memory_receipt"
  | "archive_derived_law"
  | "summary_derived";

export type FinalizationRunReceiptAction =
  | "accept_external_embodiment_run"
  | "accept_status_readback_run"
  | "accept_exact_blocker_run"
  | "block_source_gap"
  | "block_branch_mismatch"
  | "block_stale_base_head"
  | "block_repeated_move_class"
  | "block_repeated_artifact_class"
  | "block_incomplete_run_receipt"
  | "block_unmoved_external_embodiment";

export interface FinalizationRunProgress {
  move_class: FinalizationRunMoveClass;
  artifact_class: string;
  branch: string;
  base_head_sha: string;
  resulting_head_sha: string;
  next_status_expected_head_sha?: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  status_surface_ids: string[];
  blocker?: string;
}

export interface FinalizationRunReceiptInput {
  run_id: string;
  active_branch: string;
  live_head_sha: string;
  instruction_head_sha: string;
  resolved_historical_heads: string[];
  source_tiers: FinalizationRunSourceTier[];
  prohibited_move_classes: string[];
  spent_artifact_classes: string[];
  progress: FinalizationRunProgress;
}

export interface FinalizationRunReceiptVerdict {
  ok: boolean;
  action: FinalizationRunReceiptAction;
  run_id: string | null;
  branch: string;
  base_head_sha: string;
  resulting_head_sha: string;
  quarantined_instruction_head_sha: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function hasSource(input: FinalizationRunReceiptInput, tier: FinalizationRunSourceTier): boolean {
  return input.source_tiers.includes(tier);
}

function base(input: FinalizationRunReceiptInput): Pick<
  FinalizationRunReceiptVerdict,
  "branch" | "base_head_sha" | "resulting_head_sha" | "quarantined_instruction_head_sha"
> {
  const instructionHeadIsHistorical =
    input.instruction_head_sha !== input.live_head_sha &&
    input.resolved_historical_heads.includes(input.instruction_head_sha);

  return {
    branch: input.active_branch,
    base_head_sha: input.live_head_sha,
    resulting_head_sha: input.progress.resulting_head_sha,
    quarantined_instruction_head_sha: instructionHeadIsHistorical ? input.instruction_head_sha : null,
  };
}

function block(
  input: FinalizationRunReceiptInput,
  action: Exclude<
    FinalizationRunReceiptAction,
    "accept_external_embodiment_run" | "accept_status_readback_run" | "accept_exact_blocker_run"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): FinalizationRunReceiptVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    run_id: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function requiredSourceBlockers(input: FinalizationRunReceiptInput): string[] {
  const blockers: string[] = [];
  if (!hasSource(input, "direct_current_instruction")) blockers.push("run receipt lacks direct current instruction source");
  if (!hasSource(input, "live_pr_metadata")) blockers.push("run receipt lacks live PR metadata source");
  if (input.progress.move_class === "fresh_status_readback" && !hasSource(input, "direct_status_surface")) {
    blockers.push("fresh status run receipt lacks direct status surface source");
  }
  return blockers;
}

function requiredProgressBlockers(input: FinalizationRunReceiptInput): string[] {
  const progress = input.progress;
  const blockers: string[] = [];

  if (!input.run_id.trim()) blockers.push("finalization run receipt has no run id");
  if (!progress.artifact_class.trim()) blockers.push("finalization run receipt has no artifact class");

  if (
    progress.move_class === "external_platform_embodiment" ||
    progress.move_class === "fresh_status_readback"
  ) {
    if (progress.proof_artifacts.length === 0) blockers.push("finalization run receipt has no proof artifact");
  }

  if (progress.move_class === "external_platform_embodiment") {
    if (!progress.changed_files.some(executablePlatformPath)) {
      blockers.push("external embodiment run changes no executable platform file");
    }
    if (progress.executable_artifacts.length === 0) blockers.push("external embodiment run has no executable artifact");
    if (progress.routing_artifacts.length === 0) blockers.push("external embodiment run has no routing artifact");
  }

  if (progress.move_class === "fresh_status_readback" && progress.status_surface_ids.length === 0) {
    blockers.push("fresh status run has no status surface id");
  }

  if (progress.move_class === "exact_external_blocker" && !progress.blocker?.trim()) {
    blockers.push("exact blocker run has no blocker text");
  }

  return blockers;
}

function progressEvidence(input: FinalizationRunReceiptInput): string[] {
  const baseVerdict = base(input);
  return [
    input.run_id,
    input.progress.move_class,
    input.progress.artifact_class,
    `base ${input.live_head_sha}`,
    `result ${input.progress.resulting_head_sha}`,
    ...input.progress.changed_files.filter(executablePlatformPath),
    ...input.progress.executable_artifacts,
    ...input.progress.routing_artifacts,
    ...input.progress.proof_artifacts,
    ...input.progress.status_surface_ids,
    ...(input.progress.blocker ? [input.progress.blocker] : []),
    ...(baseVerdict.quarantined_instruction_head_sha
      ? [`instruction head preserved as historical ${baseVerdict.quarantined_instruction_head_sha}`]
      : []),
  ];
}

export function compileFinalizationRunReceipt(
  input: FinalizationRunReceiptInput,
): FinalizationRunReceiptVerdict {
  const sourceBlockers = requiredSourceBlockers(input);
  if (sourceBlockers.length > 0) {
    return block(
      input,
      "block_source_gap",
      sourceBlockers,
      "rebuild the run receipt from direct current instruction, live PR metadata, and direct status source when needed",
    );
  }

  if (input.progress.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`run progress branch ${input.progress.branch} does not match active branch ${input.active_branch}`],
      "bind the finalization run to the active manifestation branch",
    );
  }

  if (input.progress.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_base_head",
      [`run progress base ${input.progress.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the finalization run receipt to the live PR head",
      [`instruction head ${input.instruction_head_sha}`],
    );
  }

  if (input.prohibited_move_classes.includes(input.progress.move_class)) {
    return block(
      input,
      "block_repeated_move_class",
      [`finalization run repeats prohibited move class: ${input.progress.move_class}`],
      "choose one of the still-valid terminal progress classes without replaying an exhausted class",
    );
  }

  if (input.spent_artifact_classes.includes(input.progress.artifact_class)) {
    return block(
      input,
      "block_repeated_artifact_class",
      [`finalization run repeats spent artifact class: ${input.progress.artifact_class}`],
      "choose an unspent executable artifact class before moving the branch",
    );
  }

  const progressBlockers = requiredProgressBlockers(input);
  if (progressBlockers.length > 0) {
    return block(
      input,
      "block_incomplete_run_receipt",
      progressBlockers,
      "complete executable, routing, proof, status, or blocker evidence before accepting the run receipt",
    );
  }

  if (input.progress.move_class === "external_platform_embodiment") {
    const blockers: string[] = [];
    if (input.progress.resulting_head_sha === input.live_head_sha) {
      blockers.push("external embodiment run did not move the live head");
    }
    if (input.progress.next_status_expected_head_sha !== input.progress.resulting_head_sha) {
      blockers.push("external embodiment run does not bind next status readback to the resulting head");
    }
    if (blockers.length > 0) {
      return block(
        input,
        "block_unmoved_external_embodiment",
        blockers,
        "move the branch with the executable embodiment and bind the next status readback to the moved head",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "accept_external_embodiment_run",
      run_id: input.run_id,
      decisive_evidence: progressEvidence(input),
      blockers: [],
      next_route: "record the run receipt and read status only for the resulting head",
    };
  }

  if (input.progress.move_class === "fresh_status_readback") {
    return {
      ...base(input),
      ok: true,
      action: "accept_status_readback_run",
      run_id: input.run_id,
      decisive_evidence: progressEvidence(input),
      blockers: [],
      next_route: "route from the accepted live-head status surface into a non-repeated embodiment or exact blocker",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_exact_blocker_run",
    run_id: input.run_id,
    decisive_evidence: progressEvidence(input),
    blockers: input.progress.blocker ? [input.progress.blocker] : [],
    next_route: "resolve the accepted exact blocker before claiming another finalization run",
  };
}
