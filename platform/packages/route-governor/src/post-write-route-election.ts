import type { PostWriteStatusEscrowVerdict } from "./post-write-status-escrow.js";

export type PostWriteRouteElectionRequestedRoute =
  | "fresh_status_readback"
  | "review_request"
  | "merge_command"
  | "external_platform_embodiment"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_comment"
  | "warning_maintenance";

export type PostWriteRouteElectionAction =
  | "route_to_fresh_status_readback"
  | "route_to_review_request"
  | "route_to_merge_command"
  | "route_to_next_embodiment"
  | "emit_exact_external_blocker"
  | "block_reused_election"
  | "block_branch_mismatch"
  | "block_head_mismatch"
  | "block_non_progress_route"
  | "block_premature_route"
  | "block_unresolved_write_status"
  | "block_missing_exact_blocker";

export interface PostWriteRouteElectionInput {
  active_branch: string;
  live_head_sha: string;
  election_id: string;
  spent_election_ids: string[];
  escrow: PostWriteStatusEscrowVerdict;
  requested_route: PostWriteRouteElectionRequestedRoute;
  exact_blocker?: string;
}

export interface PostWriteRouteElectionVerdict {
  ok: boolean;
  action: PostWriteRouteElectionAction;
  branch: string;
  head_sha: string;
  election_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_ROUTES = new Set<PostWriteRouteElectionRequestedRoute>([
  "metadata_reread",
  "duplicate_comment",
  "warning_maintenance",
]);

const RELEASED_STATUS_ROUTES = new Set<PostWriteRouteElectionRequestedRoute>([
  "review_request",
  "merge_command",
  "external_platform_embodiment",
]);

function base(input: PostWriteRouteElectionInput): Pick<
  PostWriteRouteElectionVerdict,
  "branch" | "head_sha" | "election_id"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    election_id: input.election_id.trim() || null,
  };
}

function escrowEvidence(escrow: PostWriteStatusEscrowVerdict): string[] {
  return [
    `escrow ${escrow.escrow_id ?? "<missing>"}`,
    `escrow action ${escrow.action}`,
    `required status head ${escrow.required_status_head_sha}`,
    ...escrow.decisive_evidence,
  ];
}

function block(
  input: PostWriteRouteElectionInput,
  action: Exclude<
    PostWriteRouteElectionAction,
    | "route_to_fresh_status_readback"
    | "route_to_review_request"
    | "route_to_merge_command"
    | "route_to_next_embodiment"
    | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PostWriteRouteElectionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function electPostWriteRoute(input: PostWriteRouteElectionInput): PostWriteRouteElectionVerdict {
  const electionId = input.election_id.trim();
  const evidence = [`election ${electionId || "<missing>"}`, ...escrowEvidence(input.escrow)];

  if (!electionId || input.spent_election_ids.includes(electionId)) {
    return block(
      input,
      "block_reused_election",
      [electionId ? `post-write route election already spent: ${electionId}` : "post-write route election has no id"],
      "issue a fresh election id before consuming the post-write status escrow",
      evidence,
    );
  }

  if (input.escrow.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`post-write escrow branch ${input.escrow.branch} is not active branch ${input.active_branch}`],
      "rebuild the post-write escrow on the active PR branch before choosing a route",
      evidence,
    );
  }

  if (input.escrow.required_status_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_head_mismatch",
      [`post-write escrow requires ${input.escrow.required_status_head_sha}, not live head ${input.live_head_sha}`],
      "refresh the post-write escrow against the current PR head before choosing a route",
      evidence,
    );
  }

  if (NON_PROGRESS_ROUTES.has(input.requested_route)) {
    return block(
      input,
      "block_non_progress_route",
      [`${input.requested_route} cannot consume post-write route election as progress`],
      "choose fresh status readback, a released-status route, or one exact external blocker",
      [...evidence, `requested ${input.requested_route}`],
    );
  }

  if (input.requested_route === "exact_external_blocker") {
    const exactBlocker = input.exact_blocker?.trim();
    if (!exactBlocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["exact external blocker route has no blocker text"],
        "name the exact external blocker or choose a status-bound post-write route",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [...evidence, exactBlocker],
      blockers: [exactBlocker],
      next_route: "remove the named post-write blocker before consuming another route",
    };
  }

  if (input.escrow.action === "open_post_write_status_escrow") {
    if (input.requested_route !== "fresh_status_readback") {
      return block(
        input,
        "block_premature_route",
        [`${input.requested_route} cannot run before moved-head status readback`],
        "read fresh status for the moved post-write head before review, merge, or another embodiment",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "route_to_fresh_status_readback",
      decisive_evidence: [...evidence, `requested ${input.requested_route}`],
      blockers: [],
      next_route: "read only the moved-head status surface required by the post-write escrow",
    };
  }

  if (input.escrow.action === "release_head_bound_status") {
    if (!RELEASED_STATUS_ROUTES.has(input.requested_route)) {
      return block(
        input,
        "block_premature_route",
        [`${input.requested_route} is not a released-status continuation route`],
        "choose review request, merge command, or the next executable embodiment after head-bound status releases",
        evidence,
      );
    }

    let action: Extract<
      PostWriteRouteElectionAction,
      "route_to_review_request" | "route_to_merge_command" | "route_to_next_embodiment"
    >;
    if (input.requested_route === "review_request") {
      action = "route_to_review_request";
    } else if (input.requested_route === "merge_command") {
      action = "route_to_merge_command";
    } else {
      action = "route_to_next_embodiment";
    }

    return {
      ...base(input),
      ok: true,
      action,
      decisive_evidence: [...evidence, `requested ${input.requested_route}`],
      blockers: [],
      next_route: "consume the released moved-head status once, then refresh authority after the branch moves again",
    };
  }

  return block(
    input,
    "block_unresolved_write_status",
    input.escrow.blockers.length > 0 ? input.escrow.blockers : [`post-write escrow is unresolved: ${input.escrow.action}`],
    "resolve the post-write status escrow before route election can release review, merge, or embodiment",
    evidence,
  );
}
