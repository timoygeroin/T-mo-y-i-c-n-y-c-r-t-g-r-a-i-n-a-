export type FinalizationSnapshotCandidateClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "pr_metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "local_memory_guard"
  | "reclose_resolved_blocker";

export type FinalizationSnapshotAction =
  | "admit_external_platform_embodiment"
  | "admit_fresh_status_readback"
  | "admit_exact_external_blocker"
  | "block_scope_reopen"
  | "block_branch_or_head_mismatch"
  | "block_repeated_or_prohibited_class"
  | "block_incomplete_candidate"
  | "block_stale_status_readback";

export interface FinalizationStateSnapshotCandidate {
  candidate_id: string;
  candidate_class: FinalizationSnapshotCandidateClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  new_check_runs: Array<{ id: string; head_sha: string; name: string }>;
  blocker?: string;
}

export interface FinalizationStateSnapshotInput {
  active_branch: string;
  live_head_sha: string;
  prompt_head_sha: string;
  previous_status_head_sha: string;
  resolved_historical_heads: string[];
  required_reentry_refs: string[];
  observed_reentry_refs: string[];
  attached_organs: string[];
  required_organs: string[];
  exhausted_move_classes: string[];
  prohibited_candidate_classes: FinalizationSnapshotCandidateClass[];
  allow_scope_reopen: boolean;
  candidate: FinalizationStateSnapshotCandidate;
}

export interface FinalizationStateSnapshotVerdict {
  ok: boolean;
  action: FinalizationSnapshotAction;
  branch: string;
  live_head_sha: string;
  quarantined_heads: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<FinalizationSnapshotCandidateClass>([
  "pr_metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "local_memory_guard",
  "reclose_resolved_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: FinalizationStateSnapshotInput): Pick<
  FinalizationStateSnapshotVerdict,
  "branch" | "live_head_sha" | "quarantined_heads"
> {
  const quarantined = new Set(input.resolved_historical_heads.filter((head) => head !== input.live_head_sha));
  if (input.prompt_head_sha !== input.live_head_sha) quarantined.add(input.prompt_head_sha);
  if (input.previous_status_head_sha !== input.live_head_sha) quarantined.add(input.previous_status_head_sha);
  if (input.candidate.base_head_sha !== input.live_head_sha) quarantined.add(input.candidate.base_head_sha);

  return {
    branch: input.active_branch,
    live_head_sha: input.live_head_sha,
    quarantined_heads: [...quarantined],
  };
}

function block(
  input: FinalizationStateSnapshotInput,
  action: Exclude<
    FinalizationSnapshotAction,
    "admit_external_platform_embodiment" | "admit_fresh_status_readback" | "admit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): FinalizationStateSnapshotVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function missingItems(required: string[], observed: string[]): string[] {
  const observedSet = new Set(observed);
  return required.filter((item) => !observedSet.has(item));
}

function incompleteEmbodiment(candidate: FinalizationStateSnapshotCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("snapshot embodiment changes no executable platform file");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("snapshot embodiment has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("snapshot embodiment has no future-routing artifact evidence");
  }
  if (candidate.proof_artifacts.length === 0) {
    blockers.push("snapshot embodiment has no proof artifact evidence");
  }

  return blockers;
}

function currentHeadChecks(input: FinalizationStateSnapshotInput): string[] {
  return input.candidate.new_check_runs
    .filter((run) => run.head_sha === input.live_head_sha)
    .map((run) => `new live-head check ${run.id}: ${run.name}`);
}

export function compileFinalizationStateSnapshot(
  input: FinalizationStateSnapshotInput,
): FinalizationStateSnapshotVerdict {
  const missingRefs = missingItems(input.required_reentry_refs, input.observed_reentry_refs);
  const missingOrgans = missingItems(input.required_organs, input.attached_organs);

  if ((missingRefs.length > 0 || missingOrgans.length > 0) && !input.allow_scope_reopen) {
    return block(
      input,
      "block_scope_reopen",
      [
        ...missingRefs.map((ref) => `missing required reentry ref: ${ref}`),
        ...missingOrgans.map((organ) => `missing required organ: ${organ}`),
      ],
      "complete the fixed Loading 20 reentry snapshot before choosing a terminal progress class",
    );
  }

  if (input.candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_or_head_mismatch",
      [`candidate branch ${input.candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the candidate to the active external manifestation branch",
    );
  }

  if (input.candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_branch_or_head_mismatch",
      [`candidate base ${input.candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the next progress candidate to the live PR head before release",
    );
  }

  if (
    input.prohibited_candidate_classes.includes(input.candidate.candidate_class) ||
    NON_PROGRESS_CLASSES.has(input.candidate.candidate_class) ||
    input.exhausted_move_classes.includes(input.candidate.candidate_id)
  ) {
    return block(
      input,
      "block_repeated_or_prohibited_class",
      [`prohibited or repeated finalization candidate: ${input.candidate.candidate_class}/${input.candidate.candidate_id}`],
      "choose a new external embodiment, a genuinely fresh live-head readback, or one exact external blocker",
      [input.candidate.candidate_class, input.candidate.candidate_id],
    );
  }

  if (input.candidate.candidate_class === "external_platform_embodiment") {
    const blockers = incompleteEmbodiment(input.candidate);
    if (blockers.length > 0) {
      return block(
        input,
        "block_incomplete_candidate",
        blockers,
        "attach executable, routing, and proof evidence before admitting embodiment progress",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_external_platform_embodiment",
      decisive_evidence: [
        input.candidate.candidate_id,
        `live head ${input.live_head_sha}`,
        ...input.required_reentry_refs,
        ...input.required_organs,
        ...input.candidate.changed_files.filter(executablePlatformPath),
        ...input.candidate.executable_artifacts,
        ...input.candidate.routing_artifacts,
        ...input.candidate.proof_artifacts,
      ],
      blockers: [],
      next_route: "write the admitted embodiment, then bind the next status readback to the moved branch head",
    };
  }

  if (input.candidate.candidate_class === "fresh_status_readback") {
    const headMoved = input.previous_status_head_sha !== input.live_head_sha;
    const freshChecks = currentHeadChecks(input);

    if (!headMoved && freshChecks.length === 0) {
      return block(
        input,
        "block_stale_status_readback",
        ["snapshot readback is not fresh: live head did not move and no new live-head checks are attached"],
        "do not emit another status readback until head movement or new live-head check evidence exists",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_fresh_status_readback",
      decisive_evidence: [
        ...(headMoved ? [`head moved from ${input.previous_status_head_sha} to ${input.live_head_sha}`] : []),
        ...freshChecks,
      ],
      blockers: [],
      next_route: "read only the current live-head status surface and keep historical repaired heads quarantined",
    };
  }

  if (input.candidate.candidate_class === "exact_external_blocker") {
    const blocker = input.candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_incomplete_candidate",
        ["exact external blocker candidate has no blocker text"],
        "name one exact external blocker or choose a valid embodiment/readback candidate",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_exact_external_blocker",
      decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
      blockers: [blocker],
      next_route: "remove the named blocker before attempting another finalization progress class",
    };
  }

  return block(
    input,
    "block_repeated_or_prohibited_class",
    [`candidate class cannot satisfy finalization state snapshot: ${input.candidate.candidate_class}`],
    "choose one of the three admitted finalization progress classes",
  );
}
