export type PostReadbackStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type PostReadbackMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_completed_blocker"
  | "duplicate_status_readback";

export type PostReadbackAction =
  | "commit_external_embodiment"
  | "emit_exact_external_blocker"
  | "block_duplicate_or_incomplete";

export interface PostReadbackContinuationInput {
  branch: string;
  active_branch: string;
  current_head_sha: string;
  readback_head_sha: string;
  status_verdict: PostReadbackStatusVerdict;
  move_class: PostReadbackMoveClass;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  current_head_blockers: string[];
  non_blocking_warnings: string[];
  exact_blocker?: string;
}

export interface PostReadbackContinuationVerdict {
  ok: boolean;
  action: PostReadbackAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<PostReadbackMoveClass>([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "duplicate_status_readback",
]);

function isExecutablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: PostReadbackContinuationInput): Pick<PostReadbackContinuationVerdict, "branch" | "head_sha" | "warnings"> {
  return {
    branch: input.branch,
    head_sha: input.current_head_sha,
    warnings: input.non_blocking_warnings,
  };
}

function block(input: PostReadbackContinuationInput, blockers: string[], next_route: string): PostReadbackContinuationVerdict {
  return {
    ...base(input),
    ok: false,
    action: "block_duplicate_or_incomplete",
    decisive_evidence: [],
    blockers,
    next_route,
  };
}

function statusIsPassing(input: PostReadbackContinuationInput): boolean {
  return input.status_verdict === "passing" || input.status_verdict === "passing_with_warnings";
}

function embodimentIsExecutable(input: PostReadbackContinuationInput): boolean {
  return (
    input.changed_files.some(isExecutablePlatformPath) &&
    input.executable_artifacts.length > 0 &&
    input.routing_artifacts.length > 0
  );
}

export function routePostReadbackContinuation(
  input: PostReadbackContinuationInput,
): PostReadbackContinuationVerdict {
  if (input.branch !== input.active_branch) {
    return block(input, [`post-readback route branch ${input.branch} does not match active branch ${input.active_branch}`], "rebind the route to the active PR branch");
  }

  if (input.readback_head_sha !== input.current_head_sha) {
    return block(
      input,
      [`readback head ${input.readback_head_sha} is not current PR head ${input.current_head_sha}`],
      "obtain a status readback bound to the current PR head before selecting the next move",
    );
  }

  if (NON_PROGRESS_CLASSES.has(input.move_class) || input.move_class === "fresh_status_readback") {
    return block(
      input,
      [`post-readback move is duplicate or non-progress: ${input.move_class}`],
      "choose a new executable embodiment or emit the exact current-head blocker",
    );
  }

  if (!statusIsPassing(input)) {
    const blocker = input.exact_blocker?.trim();
    if (input.move_class === "exact_external_blocker" && blocker) {
      return {
        ...base(input),
        ok: true,
        action: "emit_exact_external_blocker",
        decisive_evidence: [blocker, ...input.current_head_blockers],
        blockers: [blocker, ...input.current_head_blockers],
        next_route: "repair the named current-head blocker before any embodiment increment",
      };
    }

    return block(
      input,
      [
        `current-head status is not passing: ${input.status_verdict}`,
        ...input.current_head_blockers,
      ],
      "emit one exact current-head blocker or repair the failing status surface",
    );
  }

  if (input.move_class === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(input, ["exact external blocker move has no blocker text"], "name the blocker exactly or choose executable embodiment");
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [blocker],
      blockers: [blocker],
      next_route: "remove the named external blocker before attempting another progress class",
    };
  }

  if (!embodimentIsExecutable(input)) {
    return block(
      input,
      ["post-readback embodiment lacks executable platform change or future-routing artifact"],
      "raise the next move to executable behavior plus routing evidence",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "commit_external_embodiment",
    decisive_evidence: [
      `current-head readback ${input.current_head_sha}: ${input.status_verdict}`,
      ...input.changed_files,
      ...input.executable_artifacts,
      ...input.routing_artifacts,
    ],
    blockers: [],
    next_route: "after this embodiment moves the branch, read only status surfaces bound to the new PR head",
  };
}
