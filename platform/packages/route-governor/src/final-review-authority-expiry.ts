export type FinalReviewAuthorityExpiryAction =
  | "admit_authority_window"
  | "block_reused_window"
  | "block_branch_mismatch"
  | "block_head_mismatch"
  | "block_superseded_head"
  | "block_missing_time_boundary"
  | "block_expired_window"
  | "block_not_yet_active";

export interface FinalReviewAuthorityWindowInput {
  window_id: string;
  spent_window_ids: string[];
  active_branch: string;
  live_head_sha: string;
  observed_latest_head_sha: string;
  authority_branch: string;
  authority_head_sha: string;
  issued_at: string;
  not_before?: string;
  expires_at: string;
  checked_at: string;
  evidence: string[];
}

export interface FinalReviewAuthorityWindowVerdict {
  ok: boolean;
  action: FinalReviewAuthorityExpiryAction;
  window_id: string | null;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: FinalReviewAuthorityWindowInput): Pick<
  FinalReviewAuthorityWindowVerdict,
  "window_id" | "branch" | "head_sha"
> {
  return {
    window_id: input.window_id.trim() || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function routeEvidence(input: FinalReviewAuthorityWindowInput): string[] {
  return [
    `window ${input.window_id.trim() || "<missing>"}`,
    `authority head ${input.authority_head_sha}`,
    `live head ${input.live_head_sha}`,
    `observed latest head ${input.observed_latest_head_sha}`,
    `checked at ${input.checked_at}`,
    ...input.evidence,
  ];
}

function block(
  input: FinalReviewAuthorityWindowInput,
  action: Exclude<FinalReviewAuthorityExpiryAction, "admit_authority_window">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = routeEvidence(input),
): FinalReviewAuthorityWindowVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function validateFinalReviewAuthorityWindow(
  input: FinalReviewAuthorityWindowInput,
): FinalReviewAuthorityWindowVerdict {
  const windowId = input.window_id.trim();
  const evidence = routeEvidence(input);

  if (!windowId || input.spent_window_ids.includes(windowId)) {
    return block(
      input,
      "block_reused_window",
      [windowId ? `final review authority window already spent: ${windowId}` : "final review authority window has no id"],
      "open a fresh final-review authority window before consuming downstream review or merge authority",
      evidence,
    );
  }

  if (input.authority_branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`authority window ${windowId} is on ${input.authority_branch}, not ${input.active_branch}`],
      "discard cross-branch authority windows before final review routing",
      evidence,
    );
  }

  if (input.authority_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_head_mismatch",
      [`authority window ${windowId} belongs to ${input.authority_head_sha}, not live head ${input.live_head_sha}`],
      "rebuild authority from the live PR head before final review routing",
      evidence,
    );
  }

  if (input.observed_latest_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_superseded_head",
      [`observed latest head ${input.observed_latest_head_sha} supersedes authority head ${input.live_head_sha}`],
      "route to moved-head status before consuming final review authority",
      evidence,
    );
  }

  const issuedAt = timestamp(input.issued_at);
  const checkedAt = timestamp(input.checked_at);
  const expiresAt = timestamp(input.expires_at);
  const notBefore = input.not_before ? timestamp(input.not_before) : null;

  if (issuedAt === null || checkedAt === null || expiresAt === null || (input.not_before && notBefore === null)) {
    return block(
      input,
      "block_missing_time_boundary",
      ["final review authority window has an invalid issued_at, checked_at, not_before, or expires_at timestamp"],
      "capture machine-readable authority timestamps before final review routing",
      evidence,
    );
  }

  if (notBefore !== null && checkedAt < notBefore) {
    return block(
      input,
      "block_not_yet_active",
      [`authority window ${windowId} is not active until ${input.not_before}`],
      "wait until the authority window is active or issue a new window bound to the live head",
      evidence,
    );
  }

  if (expiresAt <= issuedAt) {
    return block(
      input,
      "block_missing_time_boundary",
      [`authority window ${windowId} expires at or before it is issued`],
      "issue an authority window with a forward expiration boundary",
      evidence,
    );
  }

  if (checkedAt >= expiresAt) {
    return block(
      input,
      "block_expired_window",
      [`authority window ${windowId} expired at ${input.expires_at}`],
      "refresh status, mergeability, review, and blocker-retirement leases before consuming final-review authority",
      evidence,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_authority_window",
    decisive_evidence: [
      ...evidence,
      `issued at ${input.issued_at}`,
      ...(input.not_before ? [`not before ${input.not_before}`] : []),
      `expires at ${input.expires_at}`,
    ],
    blockers: [],
    next_route: "consume final-review authority only before expiry and only while the observed latest PR head remains unchanged",
  };
}
