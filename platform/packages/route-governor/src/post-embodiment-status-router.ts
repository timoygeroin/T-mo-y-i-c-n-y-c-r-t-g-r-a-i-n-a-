import type { PostEmbodimentHeadCursorAction } from "./post-embodiment-head-cursor.js";
import type { StatusSurfaceClassification } from "./status-surface.js";

export type PostEmbodimentStatusRouterAction =
  | "read_new_head_status"
  | "wait_for_new_head_checks"
  | "repair_new_head_failure"
  | "continue_after_passing_status"
  | "block_cursor_not_ready"
  | "block_status_head_mismatch";

export interface PostEmbodimentStatusRouterInput {
  branch: string;
  active_branch: string;
  new_head_sha: string;
  cursor_action: PostEmbodimentHeadCursorAction;
  status_readback_head_sha?: string;
  status_surface?: StatusSurfaceClassification;
}

export interface PostEmbodimentStatusRouterVerdict {
  ok: boolean;
  action: PostEmbodimentStatusRouterAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function base(input: PostEmbodimentStatusRouterInput): Pick<PostEmbodimentStatusRouterVerdict, "branch" | "head_sha"> {
  return {
    branch: input.branch,
    head_sha: input.new_head_sha,
  };
}

function cursorIsReady(action: PostEmbodimentHeadCursorAction): boolean {
  return action === "require_new_head_status_readback" || action === "accept_new_head_status_readback";
}

export function routePostEmbodimentStatus(
  input: PostEmbodimentStatusRouterInput,
): PostEmbodimentStatusRouterVerdict {
  const baseFields = base(input);

  if (input.branch !== input.active_branch) {
    return {
      ...baseFields,
      ok: false,
      action: "block_cursor_not_ready",
      decisive_evidence: [],
      blockers: [`post-embodiment status branch ${input.branch} does not match active branch ${input.active_branch}`],
      warnings: [],
      next_route: "bind the status router to the active PR branch before making any live-head status claim",
    };
  }

  if (!cursorIsReady(input.cursor_action)) {
    return {
      ...baseFields,
      ok: false,
      action: "block_cursor_not_ready",
      decisive_evidence: [],
      blockers: [`post-embodiment cursor action is not status-ready: ${input.cursor_action}`],
      warnings: [],
      next_route: "move the branch head with an executable embodiment before routing status results",
    };
  }

  if (!input.status_readback_head_sha) {
    return {
      ...baseFields,
      ok: false,
      action: "read_new_head_status",
      decisive_evidence: [`new head requires status readback: ${input.new_head_sha}`],
      blockers: [`missing status readback for new head ${input.new_head_sha}`],
      warnings: [],
      next_route: "read Checks, Actions, or workflow evidence bound to the new PR head",
    };
  }

  if (input.status_readback_head_sha !== input.new_head_sha) {
    return {
      ...baseFields,
      ok: false,
      action: "block_status_head_mismatch",
      decisive_evidence: [],
      blockers: [`status readback belongs to ${input.status_readback_head_sha}, not new head ${input.new_head_sha}`],
      warnings: [],
      next_route: "discard the stale status surface and read the status for the new PR head",
    };
  }

  if (!input.status_surface) {
    return {
      ...baseFields,
      ok: false,
      action: "read_new_head_status",
      decisive_evidence: [`status readback head is bound to ${input.new_head_sha}`],
      blockers: [`missing status surface classification for new head ${input.new_head_sha}`],
      warnings: [],
      next_route: "classify the bound status surface before choosing repair, wait, or continue",
    };
  }

  if (input.status_surface.verdict === "pending") {
    return {
      ...baseFields,
      ok: false,
      action: "wait_for_new_head_checks",
      decisive_evidence: input.status_surface.pending_surfaces,
      blockers: input.status_surface.pending_surfaces,
      warnings: input.status_surface.non_blocking_warnings,
      next_route: "wait for the new-head checks to complete before claiming repair or continuing embodiment",
    };
  }

  if (input.status_surface.verdict === "failing") {
    return {
      ...baseFields,
      ok: false,
      action: "repair_new_head_failure",
      decisive_evidence: input.status_surface.blocking_failures,
      blockers: input.status_surface.blocking_failures,
      warnings: input.status_surface.non_blocking_warnings,
      next_route: "repair the concrete new-head failure before any further embodiment increment",
    };
  }

  if (input.status_surface.verdict === "no_status_surface") {
    return {
      ...baseFields,
      ok: false,
      action: "read_new_head_status",
      decisive_evidence: [],
      blockers: [`no status surface is attached for new head ${input.new_head_sha}`],
      warnings: input.status_surface.non_blocking_warnings,
      next_route: "obtain a real Checks, Actions, or workflow surface for the new PR head",
    };
  }

  return {
    ...baseFields,
    ok: true,
    action: "continue_after_passing_status",
    decisive_evidence: input.status_surface.decisive_successes,
    blockers: [],
    warnings: input.status_surface.non_blocking_warnings,
    next_route: "continue with the next non-repeated executable embodiment increment",
  };
}
