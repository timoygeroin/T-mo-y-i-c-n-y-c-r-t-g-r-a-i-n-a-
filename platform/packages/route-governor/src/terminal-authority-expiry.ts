export type TerminalAuthorityKind =
  | "status_lease"
  | "mergeability_lease"
  | "review_request"
  | "review_response"
  | "merge_command"
  | "exact_external_blocker";

export type TerminalAuthorityExpiryAction =
  | "admit_terminal_authority"
  | "expire_head_moved_authority"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_replayed_authority"
  | "block_consumed_authority"
  | "block_authority_blockers"
  | "block_target_mismatch"
  | "block_missing_authority_id"
  | "block_missing_exact_blocker";

export interface TerminalAuthoritySurface {
  authority_id: string;
  kind: TerminalAuthorityKind;
  branch: string;
  head_sha: string;
  target: string;
  evidence: string[];
  blockers: string[];
  consumed?: boolean;
  exact_blocker?: string;
}

export interface TerminalAuthorityExpiryInput {
  active_branch: string;
  live_head_sha: string;
  spent_authority_ids: string[];
  expected_target: string;
  authority: TerminalAuthoritySurface;
}

export interface TerminalAuthorityExpiryVerdict {
  ok: boolean;
  action: TerminalAuthorityExpiryAction;
  authority_id: string | null;
  authority_kind: TerminalAuthorityKind;
  branch: string;
  head_sha: string;
  target: string;
  decisive_evidence: string[];
  expired_authority_ids: string[];
  blockers: string[];
  next_route: string;
}

function base(input: TerminalAuthorityExpiryInput): Pick<
  TerminalAuthorityExpiryVerdict,
  "authority_id" | "authority_kind" | "branch" | "head_sha" | "target"
> {
  return {
    authority_id: input.authority.authority_id.trim() || null,
    authority_kind: input.authority.kind,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    target: input.expected_target,
  };
}

function routeEvidence(input: TerminalAuthorityExpiryInput): string[] {
  return [
    `authority ${input.authority.authority_id.trim() || "<missing>"}`,
    `kind ${input.authority.kind}`,
    `authority head ${input.authority.head_sha}`,
    `live head ${input.live_head_sha}`,
    `target ${input.authority.target}`,
    ...input.authority.evidence,
  ];
}

function block(
  input: TerminalAuthorityExpiryInput,
  action: Exclude<TerminalAuthorityExpiryAction, "admit_terminal_authority" | "emit_exact_external_blocker">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
  expiredAuthorityIds: string[] = [],
): TerminalAuthorityExpiryVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    expired_authority_ids: expiredAuthorityIds,
    blockers,
    next_route: nextRoute,
  };
}

export function guardTerminalAuthorityExpiry(
  input: TerminalAuthorityExpiryInput,
): TerminalAuthorityExpiryVerdict {
  const authorityId = input.authority.authority_id.trim();
  const evidence = routeEvidence(input);

  if (!authorityId) {
    return block(
      input,
      "block_missing_authority_id",
      ["terminal authority has no authority id"],
      "compile a durable authority id before terminal continuation consumes it",
      evidence,
    );
  }

  if (input.authority.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`terminal authority ${authorityId} is on ${input.authority.branch}, not ${input.active_branch}`],
      "discard cross-branch terminal authority before review, merge, or blocker continuation",
      evidence,
    );
  }

  if (input.authority.head_sha !== input.live_head_sha) {
    return block(
      input,
      "expire_head_moved_authority",
      [`terminal authority ${authorityId} expired when live head moved to ${input.live_head_sha}`],
      "obtain fresh live-head terminal authority before consuming review, merge, or blocker continuation",
      evidence,
      [authorityId],
    );
  }

  if (input.spent_authority_ids.includes(authorityId)) {
    return block(
      input,
      "block_replayed_authority",
      [`terminal authority already spent: ${authorityId}`],
      "capture a new authority surface before another terminal operation is admitted",
      evidence,
    );
  }

  if (input.authority.consumed) {
    return block(
      input,
      "block_consumed_authority",
      [`terminal authority ${authorityId} has already been consumed`],
      "do not reuse one-time terminal authority for a second review, merge, or blocker operation",
      evidence,
    );
  }

  if (input.authority.target !== input.expected_target) {
    return block(
      input,
      "block_target_mismatch",
      [`terminal authority target ${input.authority.target} is not ${input.expected_target}`],
      "consume terminal authority only for the target operation it admitted",
      evidence,
    );
  }

  if (input.authority.kind === "exact_external_blocker") {
    const blocker = input.authority.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["exact external blocker authority has no blocker text"],
        "name the exact external blocker before terminal blocker authority is admitted",
        evidence,
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [...evidence, blocker],
      expired_authority_ids: [],
      blockers: [blocker],
      next_route: "remove the named external blocker before consuming terminal authority again",
    };
  }

  if (input.authority.blockers.length > 0) {
    return block(
      input,
      "block_authority_blockers",
      input.authority.blockers,
      "clear terminal authority blockers before review, merge, or status continuation",
      evidence,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_terminal_authority",
    decisive_evidence: evidence,
    expired_authority_ids: [],
    blockers: [],
    next_route: "consume this authority exactly once; expire it immediately after use or after any PR head movement",
  };
}
