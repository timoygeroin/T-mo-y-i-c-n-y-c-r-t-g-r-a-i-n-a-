export type TerminalReleaseInstructionAction =
  | "release_merge_instruction"
  | "release_review_instruction"
  | "release_status_instruction"
  | "release_embodiment_instruction"
  | "release_exact_blocker"
  | "block_stale_surface"
  | "block_historical_head"
  | "block_ambiguous_terminal_instruction";

export type TerminalReleaseTarget = "merge" | "request_review" | "read_status" | "continue_embodiment" | "block";

export interface TerminalReleaseStatusSurface {
  surface_id: string;
  head_sha: string;
  verdict: "passing" | "passing_with_warnings" | "pending" | "failing" | "missing";
  decisive_successes: string[];
  blockers: string[];
  warnings: string[];
}

export interface TerminalReleaseInstructionInput {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  live_head_sha: string;
  last_executable_head_sha: string;
  historical_repaired_heads: string[];
  draft: boolean;
  mergeable: boolean;
  review_requested: boolean;
  requested_target: TerminalReleaseTarget;
  status_surface?: TerminalReleaseStatusSurface;
  exact_blocker?: string;
}

export interface TerminalReleaseInstruction {
  ok: boolean;
  action: TerminalReleaseInstructionAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  target: TerminalReleaseTarget | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function base(input: TerminalReleaseInstructionInput): Pick<
  TerminalReleaseInstruction,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "warnings"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.branch,
    head_sha: input.live_head_sha,
    warnings: input.status_surface?.warnings ?? [],
  };
}

function block(
  input: TerminalReleaseInstructionInput,
  action: Exclude<
    TerminalReleaseInstructionAction,
    | "release_merge_instruction"
    | "release_review_instruction"
    | "release_status_instruction"
    | "release_embodiment_instruction"
    | "release_exact_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): TerminalReleaseInstruction {
  return {
    ...base(input),
    ok: false,
    action,
    target: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function liveStatusReady(input: TerminalReleaseInstructionInput): boolean {
  return Boolean(
    input.status_surface &&
      input.status_surface.head_sha === input.live_head_sha &&
      (input.status_surface.verdict === "passing" || input.status_surface.verdict === "passing_with_warnings") &&
      input.status_surface.decisive_successes.length > 0 &&
      input.status_surface.blockers.length === 0,
  );
}

function release(
  input: TerminalReleaseInstructionInput,
  action: Exclude<
    TerminalReleaseInstructionAction,
    "block_stale_surface" | "block_historical_head" | "block_ambiguous_terminal_instruction"
  >,
  target: TerminalReleaseTarget,
  evidence: string[],
  nextRoute: string,
  blockers: string[] = [],
): TerminalReleaseInstruction {
  return {
    ...base(input),
    ok: action === "release_exact_blocker" || blockers.length === 0,
    action,
    target,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function compileTerminalReleaseInstruction(
  input: TerminalReleaseInstructionInput,
): TerminalReleaseInstruction {
  if (input.historical_repaired_heads.includes(input.live_head_sha)) {
    return block(
      input,
      "block_historical_head",
      [`live head ${input.live_head_sha} is a resolved historical repaired head`],
      "advance from the historical repaired head before releasing terminal progress",
    );
  }

  if (input.status_surface && input.status_surface.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_surface",
      [`status surface ${input.status_surface.surface_id} belongs to ${input.status_surface.head_sha}`],
      "discard stale status and read the current PR head before terminal release instruction",
      [input.status_surface.surface_id],
    );
  }

  const baseEvidence = [
    `live head ${input.live_head_sha}`,
    `last executable head ${input.last_executable_head_sha}`,
    `requested target ${input.requested_target}`,
  ];

  if (input.live_head_sha !== input.last_executable_head_sha) {
    if (input.requested_target === "continue_embodiment") {
      return release(
        input,
        "release_embodiment_instruction",
        "continue_embodiment",
        baseEvidence,
        "compile an executable embodiment receipt for the moved live head before terminal review, merge, or status reuse",
      );
    }

    return block(
      input,
      "block_ambiguous_terminal_instruction",
      [`live head ${input.live_head_sha} has not been admitted as executable head ${input.last_executable_head_sha}`],
      "choose continue_embodiment for the moved head, or first admit a fresh executable receipt for this head",
      baseEvidence,
    );
  }

  if (input.requested_target === "block") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_ambiguous_terminal_instruction",
        ["block target has no exact blocker text"],
        "provide one exact external blocker before releasing blocker progress",
        baseEvidence,
      );
    }

    return release(
      input,
      "release_exact_blocker",
      "block",
      [...baseEvidence, blocker],
      "resolve the exact blocker before requesting terminal release again",
      [blocker],
    );
  }

  if (!input.status_surface || !liveStatusReady(input)) {
    const blockers = [
      ...(!input.status_surface ? [`no status surface is attached for live head ${input.live_head_sha}`] : []),
      ...(input.status_surface?.blockers ?? []),
      ...(input.status_surface?.verdict === "pending" ? ["status surface is pending"] : []),
      ...(input.status_surface?.verdict === "failing" ? ["status surface is failing"] : []),
      ...(input.status_surface?.verdict === "missing" ? ["status surface is missing"] : []),
      ...(input.status_surface && input.status_surface.decisive_successes.length === 0
        ? ["status surface has no decisive success evidence"]
        : []),
    ];

    if (input.requested_target === "read_status") {
      return release(
        input,
        "release_status_instruction",
        "read_status",
        baseEvidence,
        "read live-head status before terminal review or merge release",
        blockers,
      );
    }

    return block(
      input,
      "block_ambiguous_terminal_instruction",
      blockers,
      "route to read_status before review or merge, unless an exact blocker is known",
      baseEvidence,
    );
  }

  const readyEvidence = [
    ...baseEvidence,
    `status surface ${input.status_surface.surface_id}`,
    ...input.status_surface.decisive_successes,
  ];

  if (input.draft) {
    return block(
      input,
      "block_ambiguous_terminal_instruction",
      ["PR is still draft"],
      "mark the PR ready for review before terminal release",
      readyEvidence,
    );
  }

  if (input.requested_target === "merge") {
    if (!input.mergeable) {
      return block(
        input,
        "block_ambiguous_terminal_instruction",
        ["GitHub mergeability is not confirmed"],
        "request review or read status until mergeability is confirmed",
        readyEvidence,
      );
    }

    return release(
      input,
      "release_merge_instruction",
      "merge",
      readyEvidence,
      "compile a guarded GitHub merge command for this exact live head",
    );
  }

  if (input.requested_target === "request_review") {
    return release(
      input,
      "release_review_instruction",
      "request_review",
      readyEvidence,
      input.review_requested
        ? "review has already been requested; do not duplicate the request unless the head moves"
        : "request review for this exact live head and avoid duplicate comments or labels",
    );
  }

  return block(
    input,
    "block_ambiguous_terminal_instruction",
    [`terminal target ${input.requested_target} is weaker than admitted review or merge`],
    "choose merge, request_review, or an exact blocker from the admitted live-head status",
    readyEvidence,
  );
}
