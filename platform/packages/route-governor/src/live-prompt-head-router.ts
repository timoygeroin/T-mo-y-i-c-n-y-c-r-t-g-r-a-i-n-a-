export type LivePromptHeadMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "old_blocker_replay"
  | "duplicate_status_readback"
  | "metadata_reread"
  | "warning_repair";

export type LivePromptHeadRouterAction =
  | "admit_runtime_embodiment"
  | "admit_fresh_status_readback"
  | "emit_exact_external_blocker"
  | "block_stale_head_replay"
  | "block_duplicate_or_metadata"
  | "block_incomplete_candidate"
  | "block_spent_candidate";

export interface LivePromptHeadStatusSurface {
  id: string;
  head_sha: string;
  conclusion: "success" | "failure" | "pending" | "cancelled" | "neutral";
}

export interface LivePromptHeadCandidate {
  candidate_id: string;
  active_branch: string;
  live_head_sha: string;
  prompt_head_sha?: string;
  previous_resolved_head_sha?: string;
  move_class: LivePromptHeadMoveClass;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  status_surfaces?: LivePromptHeadStatusSurface[];
  blocker?: string;
}

export interface LivePromptHeadRouterInput {
  active_branch: string;
  live_head_sha: string;
  resolved_head_shas: string[];
  spent_candidate_ids: string[];
  candidate: LivePromptHeadCandidate;
}

export interface LivePromptHeadRouterVerdict {
  ok: boolean;
  action: LivePromptHeadRouterAction;
  branch: string;
  head_sha: string;
  admitted_candidate_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<LivePromptHeadMoveClass>([
  "duplicate_status_readback",
  "metadata_reread",
  "warning_repair",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && path.endsWith(".ts");
}

function base(input: LivePromptHeadRouterInput): Pick<LivePromptHeadRouterVerdict, "branch" | "head_sha"> {
  return { branch: input.active_branch, head_sha: input.live_head_sha };
}

function block(
  input: LivePromptHeadRouterInput,
  action: Exclude<LivePromptHeadRouterAction, "admit_runtime_embodiment" | "admit_fresh_status_readback" | "emit_exact_external_blocker">,
  blockers: string[],
  nextRoute: string,
): LivePromptHeadRouterVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_candidate_id: null,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function promptHeadIsResolved(input: LivePromptHeadRouterInput): boolean {
  const promptHead = input.candidate.prompt_head_sha;
  if (!promptHead) return false;
  return promptHead !== input.live_head_sha && input.resolved_head_shas.includes(promptHead);
}

function liveStatusSurfaces(input: LivePromptHeadRouterInput): LivePromptHeadStatusSurface[] {
  return (input.candidate.status_surfaces ?? []).filter((surface) => surface.head_sha === input.live_head_sha);
}

function candidateCompletionBlockers(candidate: LivePromptHeadCandidate): string[] {
  const blockers: string[] = [];
  if (!candidate.candidate_id.trim()) blockers.push("candidate has no id");
  if (!candidate.changed_files.some(executablePlatformPath)) blockers.push("candidate changes no executable platform TypeScript file");
  if (candidate.executable_artifacts.length === 0) blockers.push("candidate has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("candidate has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("candidate has no proof artifact evidence");
  return blockers;
}

export function routeLivePromptHead(input: LivePromptHeadRouterInput): LivePromptHeadRouterVerdict {
  const candidate = input.candidate;

  if (input.spent_candidate_ids.includes(candidate.candidate_id)) {
    return block(
      input,
      "block_spent_candidate",
      [`candidate already spent: ${candidate.candidate_id}`],
      "select a new live-head candidate before moving the branch again",
    );
  }

  if (candidate.active_branch !== input.active_branch || candidate.live_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_incomplete_candidate",
      [
        ...(candidate.active_branch !== input.active_branch
          ? [`candidate branch ${candidate.active_branch} does not match active branch ${input.active_branch}`]
          : []),
        ...(candidate.live_head_sha !== input.live_head_sha
          ? [`candidate live head ${candidate.live_head_sha} does not match ${input.live_head_sha}`]
          : []),
      ],
      "bind the candidate to the current PR branch and live head before admission",
    );
  }

  if (promptHeadIsResolved(input) && (candidate.move_class === "old_blocker_replay" || candidate.blocker?.includes(candidate.prompt_head_sha ?? ""))) {
    return block(
      input,
      "block_stale_head_replay",
      [`resolved prompt head cannot drive the next move: ${candidate.prompt_head_sha}`],
      "discard the resolved-head route and choose a live-head embodiment, live-head status readback, or live-head blocker",
    );
  }

  if (NON_PROGRESS_CLASSES.has(candidate.move_class)) {
    return block(
      input,
      "block_duplicate_or_metadata",
      [`move class is not progress here: ${candidate.move_class}`],
      "choose executable embodiment, live-head status readback, or an exact live-head blocker",
    );
  }

  if (candidate.move_class === "fresh_status_readback") {
    const surfaces = liveStatusSurfaces(input);
    if (surfaces.length === 0) {
      return block(
        input,
        "block_incomplete_candidate",
        ["fresh status readback has no status surface tied to the live head"],
        "obtain a status surface whose head sha equals the live PR head",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_fresh_status_readback",
      admitted_candidate_id: candidate.candidate_id,
      decisive_evidence: surfaces.map((surface) => `${surface.id}:${surface.head_sha}:${surface.conclusion}`),
      blockers: [],
      next_route: "release only the live-head status verdict, then require a new executable embodiment for further progress",
    };
  }

  if (candidate.move_class === "exact_external_blocker") {
    if (!candidate.blocker?.includes(input.live_head_sha)) {
      return block(
        input,
        "block_incomplete_candidate",
        ["exact external blocker must name the live head sha"],
        "bind the blocker to the current PR head before release",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      admitted_candidate_id: candidate.candidate_id,
      decisive_evidence: [candidate.blocker],
      blockers: [candidate.blocker],
      next_route: "remove the named live-head blocker before attempting another progress class",
    };
  }

  if (candidate.move_class === "external_platform_embodiment") {
    const blockers = candidateCompletionBlockers(candidate);
    if (blockers.length > 0) {
      return block(input, "block_incomplete_candidate", blockers, "complete executable, routing, and proof evidence first");
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_runtime_embodiment",
      admitted_candidate_id: candidate.candidate_id,
      decisive_evidence: [
        candidate.candidate_id,
        ...candidate.changed_files.filter(executablePlatformPath),
        ...candidate.executable_artifacts,
        ...candidate.routing_artifacts,
        ...candidate.proof_artifacts,
      ],
      blockers: [],
      next_route: "commit the live-head embodiment increment, then read only the moved head before another status claim",
    };
  }

  return block(
    input,
    "block_incomplete_candidate",
    [`unsupported move class: ${candidate.move_class}`],
    "choose one of the admitted live-head move classes",
  );
}
