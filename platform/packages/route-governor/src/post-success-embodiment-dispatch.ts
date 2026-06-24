export type PostSuccessMoveClass =
  | "executable_routing_increment"
  | "fresh_status_readback"
  | "warning_maintenance"
  | "review_request"
  | "duplicate_summary"
  | "metadata_reread"
  | "local_memory_guard"
  | "exact_external_blocker";

export type PostSuccessDispatchAction =
  | "dispatch_executable_embodiment"
  | "dispatch_exact_external_blocker"
  | "block_until_green_readback"
  | "block_branch_mismatch"
  | "block_spent_or_incomplete";

export interface PostSuccessCandidate {
  candidate_id: string;
  move_class: PostSuccessMoveClass;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
}

export interface PostSuccessEmbodimentDispatchInput {
  branch: string;
  target_branch: string;
  current_head_sha: string;
  accepted_status_head_sha: string;
  accepted_status_run_ids: string[];
  resolved_blocker_ids: string[];
  spent_move_classes: string[];
  candidates: PostSuccessCandidate[];
}

export interface RejectedPostSuccessCandidate {
  candidate_id: string;
  reasons: string[];
}

export interface PostSuccessEmbodimentDispatchVerdict {
  ok: boolean;
  action: PostSuccessDispatchAction;
  branch: string;
  head_sha: string;
  selected_candidate_id: string | null;
  decisive_evidence: string[];
  rejected: RejectedPostSuccessCandidate[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<PostSuccessMoveClass>([
  "warning_maintenance",
  "review_request",
  "duplicate_summary",
  "metadata_reread",
  "local_memory_guard",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function base(
  input: PostSuccessEmbodimentDispatchInput,
): Pick<PostSuccessEmbodimentDispatchVerdict, "branch" | "head_sha"> {
  return { branch: input.branch, head_sha: input.current_head_sha };
}

function block(
  input: PostSuccessEmbodimentDispatchInput,
  action: Exclude<PostSuccessDispatchAction, "dispatch_executable_embodiment" | "dispatch_exact_external_blocker">,
  blockers: string[],
  nextRoute: string,
  rejected: RejectedPostSuccessCandidate[] = [],
): PostSuccessEmbodimentDispatchVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    selected_candidate_id: null,
    decisive_evidence: [],
    rejected,
    blockers,
    next_route: nextRoute,
  };
}

function rejectCandidate(input: PostSuccessEmbodimentDispatchInput, candidate: PostSuccessCandidate): string[] {
  const reasons: string[] = [];
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));

  if (!candidate.candidate_id.trim()) reasons.push("candidate has no id");
  if (input.spent_move_classes.includes(candidate.move_class)) reasons.push(`move class is already spent: ${candidate.move_class}`);
  if (candidate.base_head_sha !== input.current_head_sha) {
    reasons.push(`candidate base ${candidate.base_head_sha} is not current head ${input.current_head_sha}`);
  }
  if (NON_PROGRESS_CLASSES.has(candidate.move_class)) reasons.push(`post-success move is non-progress: ${candidate.move_class}`);
  if (candidate.move_class === "fresh_status_readback") {
    reasons.push("same-head status readback is already accepted; wait for a moved head or new checks");
  }

  if (candidate.move_class === "exact_external_blocker") {
    if (!candidate.blocker?.trim()) reasons.push("exact blocker candidate has no blocker text");
    return reasons;
  }

  if (candidate.move_class === "executable_routing_increment") {
    if (executableChanges.length === 0) reasons.push("candidate changes no executable platform file");
    if (executableChanges.length > 0 && behaviorChanges.length === 0) {
      reasons.push("candidate is proof-only and has no behavior file");
    }
    if (candidate.executable_artifacts.length === 0) reasons.push("candidate has no executable artifact evidence");
    if (candidate.routing_artifacts.length === 0) reasons.push("candidate has no future-routing artifact evidence");
    if (candidate.proof_artifacts.length === 0) reasons.push("candidate has no proof artifact evidence");
  }

  return reasons;
}

function priority(candidate: PostSuccessCandidate): number {
  switch (candidate.move_class) {
    case "executable_routing_increment":
      return 2;
    case "exact_external_blocker":
      return 1;
    default:
      return 0;
  }
}

export function dispatchPostSuccessEmbodiment(
  input: PostSuccessEmbodimentDispatchInput,
): PostSuccessEmbodimentDispatchVerdict {
  if (input.branch !== input.target_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`active branch ${input.branch} does not match target branch ${input.target_branch}`],
      "bind the post-success dispatch to the active PR branch",
    );
  }

  if (input.current_head_sha !== input.accepted_status_head_sha || input.accepted_status_run_ids.length === 0) {
    return block(
      input,
      "block_until_green_readback",
      [
        `accepted status head ${input.accepted_status_head_sha || "none"} does not prove current head ${input.current_head_sha}`,
      ],
      "read passing current-head status before dispatching post-success embodiment",
    );
  }

  const rejected: RejectedPostSuccessCandidate[] = [];
  const selectable: PostSuccessCandidate[] = [];

  for (const candidate of input.candidates) {
    const reasons = rejectCandidate(input, candidate);
    if (reasons.length > 0) {
      rejected.push({ candidate_id: candidate.candidate_id || "(missing)", reasons });
      continue;
    }
    selectable.push(candidate);
  }

  selectable.sort((left, right) => priority(right) - priority(left));
  const selected = selectable[0] ?? null;

  if (!selected) {
    return block(
      input,
      "block_spent_or_incomplete",
      ["no post-success candidate survived as executable embodiment or exact blocker"],
      "supply a behavior-bearing executable routing increment or one exact external blocker",
      rejected,
    );
  }

  if (selected.move_class === "exact_external_blocker") {
    const blocker = selected.blocker?.trim() ?? "";
    return {
      ...base(input),
      ok: true,
      action: "dispatch_exact_external_blocker",
      selected_candidate_id: selected.candidate_id,
      decisive_evidence: [
        ...input.accepted_status_run_ids.map((id) => `accepted current-head status run ${id}`),
        ...input.resolved_blocker_ids.map((id) => `resolved blocker ${id}`),
        blocker,
      ],
      rejected,
      blockers: [blocker],
      next_route: "remove the named blocker before dispatching another post-success embodiment",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "dispatch_executable_embodiment",
    selected_candidate_id: selected.candidate_id,
    decisive_evidence: [
      ...input.accepted_status_run_ids.map((id) => `accepted current-head status run ${id}`),
      ...input.resolved_blocker_ids.map((id) => `resolved blocker ${id}`),
      ...selected.changed_files.filter(executablePlatformPath),
      ...selected.executable_artifacts,
      ...selected.routing_artifacts,
      ...selected.proof_artifacts,
    ],
    rejected,
    blockers: [],
    next_route: "commit the selected executable embodiment, then bind the next status readback to the moved head",
  };
}
