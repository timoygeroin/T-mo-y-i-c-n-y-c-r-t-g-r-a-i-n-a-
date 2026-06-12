export type ActiveSinkWriteMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "replayed_repaired_head_blocker";

export type ActiveSinkWriteAction =
  | "compile_active_sink_write_plan"
  | "route_live_head_status_readback"
  | "emit_live_head_blocker"
  | "block_branch_mismatch"
  | "block_stale_candidate_head"
  | "block_non_progress_move"
  | "block_replayed_repaired_head_blocker"
  | "block_incomplete_write_plan"
  | "block_missing_exact_blocker";

export type ActiveSinkMutationKind = "create_file" | "update_file";

export interface ActiveSinkMutationCandidate {
  mutation_id: string;
  kind: ActiveSinkMutationKind;
  path: string;
  commit_message: string;
  content_ref: string;
  current_blob_sha?: string;
  executable_artifact: string;
  routing_artifact: string;
}

export interface ActiveSinkWriteCandidate {
  move_class: ActiveSinkWriteMoveClass;
  plan_id: string;
  base_head_sha: string;
  mutations: ActiveSinkMutationCandidate[];
  status_surface_ids: string[];
  blocker?: string;
}

export interface ActiveSinkWritePlanInput {
  repository_full_name: string;
  pr_number: number;
  active_branch: string;
  pr_branch: string;
  instruction_head_sha: string;
  live_head_sha: string;
  resolved_repaired_head_sha: string;
  repaired_head_status_resolved: boolean;
  blocker_issue_closed: boolean;
  blocker_label_present: boolean;
  spent_plan_ids: string[];
  candidate: ActiveSinkWriteCandidate;
}

export interface ActiveSinkContentsOperation {
  sequence: number;
  mutation_id: string;
  method: ActiveSinkMutationKind;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  expected_head_sha: string;
  path: string;
  commit_message: string;
  content_ref: string;
  current_blob_sha?: string;
}

export interface ActiveSinkWritePlanVerdict {
  ok: boolean;
  action: ActiveSinkWriteAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  plan_id: string | null;
  quarantined_head_shas: string[];
  operations: ActiveSinkContentsOperation[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_MOVES = new Set<ActiveSinkWriteMoveClass>([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "replayed_repaired_head_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function repairedHeadBlockerResolved(input: ActiveSinkWritePlanInput): boolean {
  return input.repaired_head_status_resolved && input.blocker_issue_closed && !input.blocker_label_present;
}

function quarantinedHeads(input: ActiveSinkWritePlanInput): string[] {
  const heads = new Set<string>();
  if (input.instruction_head_sha !== input.live_head_sha) heads.add(input.instruction_head_sha);
  if (input.resolved_repaired_head_sha !== input.live_head_sha && repairedHeadBlockerResolved(input)) {
    heads.add(input.resolved_repaired_head_sha);
  }
  if (input.candidate.base_head_sha !== input.live_head_sha) heads.add(input.candidate.base_head_sha);
  return [...heads];
}

function base(input: ActiveSinkWritePlanInput): Pick<
  ActiveSinkWritePlanVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "plan_id" | "quarantined_head_shas"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.pr_branch,
    head_sha: input.live_head_sha,
    plan_id: input.candidate.plan_id || null,
    quarantined_head_shas: quarantinedHeads(input),
  };
}

function block(input: ActiveSinkWritePlanInput, action: Exclude<ActiveSinkWriteAction, "compile_active_sink_write_plan" | "route_live_head_status_readback" | "emit_live_head_blocker">, blockers: string[], nextRoute: string): ActiveSinkWritePlanVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    operations: [],
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function mutationBlockers(mutation: ActiveSinkMutationCandidate): string[] {
  const blockers: string[] = [];
  if (!mutation.mutation_id.trim()) blockers.push("active sink mutation has no mutation id");
  if (!mutation.path.trim()) blockers.push(`active sink mutation ${mutation.mutation_id || "<missing>"} has no path`);
  if (!mutation.commit_message.trim()) blockers.push(`active sink mutation ${mutation.mutation_id} has no commit message`);
  if (!mutation.content_ref.trim()) blockers.push(`active sink mutation ${mutation.mutation_id} has no content ref`);
  if (!mutation.executable_artifact.trim()) blockers.push(`active sink mutation ${mutation.mutation_id} has no executable artifact`);
  if (!mutation.routing_artifact.trim()) blockers.push(`active sink mutation ${mutation.mutation_id} has no routing artifact`);
  if (mutation.kind === "update_file" && !mutation.current_blob_sha?.trim()) {
    blockers.push(`active sink update ${mutation.mutation_id} has no current blob sha`);
  }
  return blockers;
}

function duplicateMutationPaths(mutations: ActiveSinkMutationCandidate[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const mutation of mutations) {
    if (seen.has(mutation.path)) duplicates.add(mutation.path);
    seen.add(mutation.path);
  }
  return [...duplicates];
}

function toOperation(
  input: ActiveSinkWritePlanInput,
  mutation: ActiveSinkMutationCandidate,
  index: number,
): ActiveSinkContentsOperation {
  return {
    sequence: index + 1,
    mutation_id: mutation.mutation_id,
    method: mutation.kind,
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.pr_branch,
    expected_head_sha: input.live_head_sha,
    path: mutation.path,
    commit_message: mutation.commit_message,
    content_ref: mutation.content_ref,
    current_blob_sha: mutation.current_blob_sha,
  };
}

export function compileActiveSinkWritePlan(input: ActiveSinkWritePlanInput): ActiveSinkWritePlanVerdict {
  const candidate = input.candidate;

  if (input.pr_branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`active sink branch ${input.pr_branch} does not match active branch ${input.active_branch}`],
      "bind the active sink to the PR manifestation branch before compiling writes",
    );
  }

  if (
    candidate.move_class === "replayed_repaired_head_blocker" ||
    (candidate.blocker?.includes(input.resolved_repaired_head_sha) && repairedHeadBlockerResolved(input))
  ) {
    return block(
      input,
      "block_replayed_repaired_head_blocker",
      [`resolved repaired-head blocker cannot be replayed for ${input.resolved_repaired_head_sha}`],
      "keep the repaired head historical and route only from the live PR head",
    );
  }

  if (NON_PROGRESS_MOVES.has(candidate.move_class)) {
    return block(
      input,
      "block_non_progress_move",
      [`active sink candidate repeats non-progress move class: ${candidate.move_class}`],
      "choose a live-head write plan, a live-head status readback, or one exact live-head blocker",
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_candidate_head",
      [`active sink candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "refresh the candidate against the live PR head before issuing connector writes",
    );
  }

  if (candidate.move_class === "fresh_status_readback") {
    if (candidate.status_surface_ids.length === 0) {
      return block(
        input,
        "block_incomplete_write_plan",
        ["live-head status readback candidate has no status surface id"],
        "attach a live-head status surface before counting readback as progress",
      );
    }
    return {
      ...base(input),
      ok: true,
      action: "route_live_head_status_readback",
      operations: [],
      decisive_evidence: [`live head ${input.live_head_sha}`, ...candidate.status_surface_ids],
      blockers: [],
      next_route: "publish only the live-head status surface, then choose the next non-repeated executable embodiment",
    };
  }

  if (candidate.move_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["active sink blocker candidate has no blocker text"],
        "name the exact live-head external blocker or compile a write plan",
      );
    }
    return {
      ...base(input),
      ok: true,
      action: "emit_live_head_blocker",
      operations: [],
      decisive_evidence: [`live head ${input.live_head_sha}`, blocker],
      blockers: [blocker],
      next_route: "remove the named live-head blocker before attempting another active sink write",
    };
  }

  if (!candidate.plan_id.trim()) {
    return block(input, "block_incomplete_write_plan", ["active sink write plan has no plan id"], "name the write plan before connector execution");
  }

  if (input.spent_plan_ids.includes(candidate.plan_id)) {
    return block(
      input,
      "block_incomplete_write_plan",
      [`active sink write plan already spent: ${candidate.plan_id}`],
      "choose a new write plan id before moving the PR head again",
    );
  }

  if (candidate.mutations.length === 0) {
    return block(input, "block_incomplete_write_plan", ["active sink write plan has no mutations"], "supply at least one executable platform mutation");
  }

  const blockers = candidate.mutations.flatMap(mutationBlockers);
  blockers.push(...duplicateMutationPaths(candidate.mutations).map((path) => `active sink write plan repeats path: ${path}`));
  if (!candidate.mutations.some((mutation) => executablePlatformPath(mutation.path))) {
    blockers.push("active sink write plan has no executable platform mutation");
  }

  if (blockers.length > 0) {
    return block(input, "block_incomplete_write_plan", blockers, "repair the live-head write plan before connector execution");
  }

  const operations = candidate.mutations.map((mutation, index) => toOperation(input, mutation, index));

  return {
    ...base(input),
    ok: true,
    action: "compile_active_sink_write_plan",
    operations,
    decisive_evidence: [
      candidate.plan_id,
      `live head ${input.live_head_sha}`,
      ...quarantinedHeads(input).map((head) => `quarantined historical head ${head}`),
      ...operations.map((operation) => `${operation.sequence}:${operation.method}:${operation.path}`),
      ...candidate.mutations.map((mutation) => mutation.executable_artifact),
      ...candidate.mutations.map((mutation) => mutation.routing_artifact),
    ],
    blockers: [],
    next_route: "execute the ordered contents operations against the live PR head, then read status only for the moved head",
  };
}
