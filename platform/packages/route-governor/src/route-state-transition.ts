export type RouteStateStatusClaim = "none" | "passing" | "passing_with_warnings" | "pending" | "failing";

export type RouteStateTransitionAction =
  | "advance_after_embodiment"
  | "hold_for_exact_blocker"
  | "block_state_transition";

export interface RouteStateTransitionInput {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  active_branch: string;
  previous_head_sha: string;
  current_head_sha: string;
  move_class: "external_platform_embodiment" | "exact_external_blocker";
  artifact_class: string;
  spent_artifact_classes: string[];
  spent_move_classes: string[];
  committed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  status_claim: RouteStateStatusClaim;
  status_readback_head_sha?: string;
  exact_blocker?: string;
}

export interface RouteContinuationState {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  spent_artifact_classes: string[];
  spent_move_classes: string[];
  required_status_head_sha: string | null;
  status_cursor: "required" | "satisfied" | "blocked";
  blockers: string[];
}

export interface RouteStateTransitionVerdict {
  ok: boolean;
  action: RouteStateTransitionAction;
  previous_head_sha: string;
  head_sha: string;
  next_state: RouteContinuationState;
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

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function baseState(input: RouteStateTransitionInput, blockers: string[] = []): RouteContinuationState {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.branch,
    head_sha: input.current_head_sha,
    spent_artifact_classes: unique(input.spent_artifact_classes),
    spent_move_classes: unique(input.spent_move_classes),
    required_status_head_sha: null,
    status_cursor: blockers.length > 0 ? "blocked" : "required",
    blockers,
  };
}

function block(input: RouteStateTransitionInput, blockers: string[], nextRoute: string): RouteStateTransitionVerdict {
  return {
    ok: false,
    action: "block_state_transition",
    previous_head_sha: input.previous_head_sha,
    head_sha: input.current_head_sha,
    next_state: baseState(input, blockers),
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(input: RouteStateTransitionInput): string[] {
  const blockers: string[] = [];

  if (!input.repository_full_name.trim()) blockers.push("route state transition has no repository");
  if (!Number.isInteger(input.pr_number) || input.pr_number < 1) blockers.push("route state transition has no valid PR number");
  if (input.branch !== input.active_branch) {
    blockers.push(`route state branch ${input.branch} does not match active branch ${input.active_branch}`);
  }
  if (input.previous_head_sha === input.current_head_sha) {
    blockers.push(`route state did not move head from ${input.previous_head_sha}`);
  }
  if (!input.artifact_class.trim()) blockers.push("route state transition has no artifact class");
  if (input.spent_artifact_classes.includes(input.artifact_class)) {
    blockers.push(`route state repeats spent artifact class: ${input.artifact_class}`);
  }
  if (!input.committed_files.some(executablePlatformPath)) {
    blockers.push("route state transition has no executable platform file");
  }
  if (input.executable_artifacts.length === 0) blockers.push("route state transition has no executable artifact evidence");
  if (input.routing_artifacts.length === 0) blockers.push("route state transition has no future-routing artifact evidence");
  if (input.proof_artifacts.length === 0) blockers.push("route state transition has no proof artifact evidence");
  if (input.status_claim !== "none" && input.status_readback_head_sha !== input.current_head_sha) {
    blockers.push(
      input.status_readback_head_sha
        ? `status claim ${input.status_claim} belongs to ${input.status_readback_head_sha}, not current head ${input.current_head_sha}`
        : `status claim ${input.status_claim} has no readback bound to current head ${input.current_head_sha}`,
    );
  }

  return blockers;
}

export function advanceRouteContinuationState(input: RouteStateTransitionInput): RouteStateTransitionVerdict {
  if (input.move_class === "exact_external_blocker") {
    const blockers = input.exact_blocker?.trim() ? [input.exact_blocker] : ["exact blocker transition has no blocker text"];
    const state = baseState(input, blockers);
    return {
      ok: Boolean(input.exact_blocker?.trim()),
      action: input.exact_blocker?.trim() ? "hold_for_exact_blocker" : "block_state_transition",
      previous_head_sha: input.previous_head_sha,
      head_sha: input.current_head_sha,
      next_state: {
        ...state,
        status_cursor: "blocked",
        required_status_head_sha: null,
      },
      decisive_evidence: input.exact_blocker?.trim() ? [input.exact_blocker] : [],
      blockers,
      next_route: input.exact_blocker?.trim()
        ? "hold the route until the exact external blocker is removed"
        : "supply one exact external blocker before freezing the route state",
    };
  }

  const blockers = embodimentBlockers(input);
  if (blockers.length > 0) {
    return block(input, blockers, "repair the embodiment evidence before advancing route continuation state");
  }

  const nextState: RouteContinuationState = {
    ...baseState(input),
    spent_artifact_classes: unique([...input.spent_artifact_classes, input.artifact_class]),
    spent_move_classes: unique([...input.spent_move_classes, input.move_class]),
    required_status_head_sha: input.current_head_sha,
    status_cursor: input.status_claim === "none" ? "required" : "satisfied",
    blockers: [],
  };

  return {
    ok: true,
    action: "advance_after_embodiment",
    previous_head_sha: input.previous_head_sha,
    head_sha: input.current_head_sha,
    next_state: nextState,
    decisive_evidence: [
      `${input.repository_full_name}#${input.pr_number}`,
      `head advanced from ${input.previous_head_sha} to ${input.current_head_sha}`,
      input.move_class,
      input.artifact_class,
      ...input.committed_files.filter(executablePlatformPath),
      ...input.executable_artifacts,
      ...input.routing_artifacts,
      ...input.proof_artifacts,
    ],
    blockers: [],
    next_route:
      input.status_claim === "none"
        ? `open status cursor for ${input.current_head_sha} before any pass/fail claim`
        : `continue from status-bound head ${input.current_head_sha} without repeating spent artifact class ${input.artifact_class}`,
  };
}
