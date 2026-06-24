export type PromotionAuthorityKind = "status" | "review" | "mergeability";

export type PromotionTarget =
  | "review_request"
  | "review_response_intake"
  | "merge_gate"
  | "merge_command"
  | "post_merge_receipt";

export type CurrentHeadPromotionGateAction =
  | "admit_current_head_promotion"
  | "block_branch_mismatch"
  | "block_missing_authority"
  | "block_stale_authority"
  | "block_failed_authority"
  | "block_pending_authority"
  | "block_reused_promotion";

export interface PromotionAuthority {
  authority_id: string;
  kind: PromotionAuthorityKind;
  branch: string;
  head_sha: string;
  ok: boolean;
  pending?: boolean;
  evidence: string[];
}

export interface CurrentHeadPromotionGateInput {
  active_branch: string;
  live_head_sha: string;
  promotion_id: string;
  spent_promotion_ids: string[];
  target: PromotionTarget;
  required_authorities: PromotionAuthorityKind[];
  authorities: PromotionAuthority[];
}

export interface CurrentHeadPromotionGateVerdict {
  ok: boolean;
  action: CurrentHeadPromotionGateAction;
  branch: string;
  head_sha: string;
  promotion_id: string | null;
  target: PromotionTarget;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function base(input: CurrentHeadPromotionGateInput): Pick<
  CurrentHeadPromotionGateVerdict,
  "branch" | "head_sha" | "promotion_id" | "target"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    promotion_id: input.promotion_id.trim() || null,
    target: input.target,
  };
}

function block(
  input: CurrentHeadPromotionGateInput,
  action: Exclude<CurrentHeadPromotionGateAction, "admit_current_head_promotion">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): CurrentHeadPromotionGateVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function authorityEvidence(authority: PromotionAuthority): string[] {
  return [
    authority.authority_id,
    authority.kind,
    `branch ${authority.branch}`,
    `head ${authority.head_sha}`,
    ...authority.evidence,
  ];
}

export function gateCurrentHeadPromotion(
  input: CurrentHeadPromotionGateInput,
): CurrentHeadPromotionGateVerdict {
  const promotionId = input.promotion_id.trim();
  const requiredKinds = unique(input.required_authorities);

  if (!promotionId || input.spent_promotion_ids.includes(promotionId)) {
    return block(
      input,
      "block_reused_promotion",
      [promotionId ? `current-head promotion already spent: ${promotionId}` : "current-head promotion has no id"],
      "issue a fresh promotion id for the live head before review or merge consumption",
    );
  }

  const branchMismatch = input.authorities.find((authority) => authority.branch !== input.active_branch);
  if (branchMismatch) {
    return block(
      input,
      "block_branch_mismatch",
      [`${branchMismatch.kind} authority ${branchMismatch.authority_id} is bound to branch ${branchMismatch.branch}`],
      "discard cross-branch promotion authority and reacquire it on the active PR branch",
      authorityEvidence(branchMismatch),
    );
  }

  const missingKinds = requiredKinds.filter(
    (kind) => !input.authorities.some((authority) => authority.kind === kind),
  );
  if (missingKinds.length > 0) {
    return block(
      input,
      "block_missing_authority",
      missingKinds.map((kind) => `missing ${kind} authority for ${input.target}`),
      "collect every required live-head authority before promotion",
    );
  }

  const staleAuthority = input.authorities.find((authority) => authority.head_sha !== input.live_head_sha);
  if (staleAuthority) {
    return block(
      input,
      "block_stale_authority",
      [`${staleAuthority.kind} authority ${staleAuthority.authority_id} cites ${staleAuthority.head_sha}, not ${input.live_head_sha}`],
      "discard stale promotion authority and reacquire all required authorities on the live head",
      authorityEvidence(staleAuthority),
    );
  }

  const pendingAuthority = input.authorities.find((authority) => authority.pending);
  if (pendingAuthority) {
    return block(
      input,
      "block_pending_authority",
      [`${pendingAuthority.kind} authority ${pendingAuthority.authority_id} is still pending`],
      "wait for the pending live-head authority or emit the exact external blocker",
      authorityEvidence(pendingAuthority),
    );
  }

  const failedAuthority = input.authorities.find((authority) => !authority.ok);
  if (failedAuthority) {
    return block(
      input,
      "block_failed_authority",
      [`${failedAuthority.kind} authority ${failedAuthority.authority_id} is not successful`],
      "repair the failed live-head authority before promotion",
      authorityEvidence(failedAuthority),
    );
  }

  const decisiveEvidence = [
    `promotion ${promotionId}`,
    `target ${input.target}`,
    `live head ${input.live_head_sha}`,
    ...input.authorities.flatMap(authorityEvidence),
  ];

  return {
    ...base(input),
    ok: true,
    action: "admit_current_head_promotion",
    decisive_evidence: decisiveEvidence,
    blockers: [],
    next_route:
      "allow the named target to consume these authorities only while the PR head remains unchanged; refresh the gate after any branch movement",
  };
}
