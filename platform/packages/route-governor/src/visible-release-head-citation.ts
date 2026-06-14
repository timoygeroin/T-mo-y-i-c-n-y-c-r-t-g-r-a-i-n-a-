export type VisibleReleaseProgressClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker";

export type VisibleReleaseStatusClaim = "none" | "passing" | "passing_with_warnings" | "pending" | "failing";

export type VisibleReleaseHeadClaimRole = "current" | "historical" | "status" | "prompt";

export type VisibleReleaseHeadCitationAction =
  | "accept_visible_release_citation"
  | "block_branch_mismatch"
  | "block_missing_current_head_claim"
  | "block_stale_current_head_claim"
  | "block_unmoved_embodiment"
  | "block_incomplete_evidence"
  | "block_unbound_status_claim"
  | "block_missing_exact_blocker";

export interface VisibleReleaseHeadClaim {
  surface_id: string;
  role: VisibleReleaseHeadClaimRole;
  head_sha: string;
  evidence: string[];
}

export interface VisibleReleaseHeadCitationInput {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  active_branch: string;
  live_head_before: string;
  resulting_head_sha: string;
  prompt_head_sha?: string;
  resolved_historical_heads: string[];
  progress_class: VisibleReleaseProgressClass;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  head_claims: VisibleReleaseHeadClaim[];
  status_claim: VisibleReleaseStatusClaim;
  status_readback_head_sha?: string;
  exact_blocker?: string;
}

export interface VisibleReleaseHeadCitationVerdict {
  ok: boolean;
  action: VisibleReleaseHeadCitationAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  accepted_current_claim_ids: string[];
  historical_head_shas: string[];
  quarantined_current_claim_ids: string[];
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

function historicalHeads(input: VisibleReleaseHeadCitationInput): string[] {
  const heads = new Set(input.resolved_historical_heads.filter((head) => head !== input.resulting_head_sha));
  if (input.prompt_head_sha && input.prompt_head_sha !== input.resulting_head_sha) heads.add(input.prompt_head_sha);
  if (input.live_head_before !== input.resulting_head_sha) heads.add(input.live_head_before);
  return [...heads];
}

function currentClaims(input: VisibleReleaseHeadCitationInput): VisibleReleaseHeadClaim[] {
  return input.head_claims.filter((claim) => claim.role === "current");
}

function acceptedCurrentClaims(input: VisibleReleaseHeadCitationInput): VisibleReleaseHeadClaim[] {
  return currentClaims(input).filter((claim) => claim.head_sha === input.resulting_head_sha);
}

function staleCurrentClaims(input: VisibleReleaseHeadCitationInput): VisibleReleaseHeadClaim[] {
  return currentClaims(input).filter((claim) => claim.head_sha !== input.resulting_head_sha);
}

function base(input: VisibleReleaseHeadCitationInput): Pick<
  VisibleReleaseHeadCitationVerdict,
  | "repository_full_name"
  | "pr_number"
  | "branch"
  | "head_sha"
  | "accepted_current_claim_ids"
  | "historical_head_shas"
  | "quarantined_current_claim_ids"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.branch,
    head_sha: input.resulting_head_sha,
    accepted_current_claim_ids: acceptedCurrentClaims(input).map((claim) => claim.surface_id),
    historical_head_shas: historicalHeads(input),
    quarantined_current_claim_ids: staleCurrentClaims(input).map((claim) => claim.surface_id),
  };
}

function block(
  input: VisibleReleaseHeadCitationInput,
  action: Exclude<VisibleReleaseHeadCitationAction, "accept_visible_release_citation">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): VisibleReleaseHeadCitationVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function incompleteEmbodimentEvidence(input: VisibleReleaseHeadCitationInput): string[] {
  const blockers: string[] = [];
  if (!input.changed_files.some(executablePlatformPath)) blockers.push("visible release cites no executable platform file");
  if (input.executable_artifacts.length === 0) blockers.push("visible release cites no executable artifact");
  if (input.routing_artifacts.length === 0) blockers.push("visible release cites no future-routing artifact");
  if (input.proof_artifacts.length === 0) blockers.push("visible release cites no proof artifact");
  return blockers;
}

function claimEvidence(claims: VisibleReleaseHeadClaim[]): string[] {
  return claims.flatMap((claim) => [claim.surface_id, `${claim.role}:${claim.head_sha}`, ...claim.evidence]);
}

export function compileVisibleReleaseHeadCitation(
  input: VisibleReleaseHeadCitationInput,
): VisibleReleaseHeadCitationVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`visible release branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind the visible release to the active PR branch before publishing it",
    );
  }

  const acceptedCurrent = acceptedCurrentClaims(input);
  if (acceptedCurrent.length === 0) {
    return block(
      input,
      "block_missing_current_head_claim",
      [`visible release does not cite resulting head ${input.resulting_head_sha} as current`],
      "cite the resulting GitHub head as the only current head before release",
      claimEvidence(input.head_claims),
    );
  }

  const staleCurrent = staleCurrentClaims(input);
  if (staleCurrent.length > 0) {
    return block(
      input,
      "block_stale_current_head_claim",
      staleCurrent.map((claim) => `visible release calls stale head current: ${claim.surface_id} -> ${claim.head_sha}`),
      "quarantine prompt, repaired, and pre-write heads as historical before release",
      claimEvidence(staleCurrent),
    );
  }

  if (input.status_claim !== "none" && input.status_readback_head_sha !== input.resulting_head_sha) {
    return block(
      input,
      "block_unbound_status_claim",
      [
        input.status_readback_head_sha
          ? `status claim ${input.status_claim} belongs to ${input.status_readback_head_sha}, not resulting head ${input.resulting_head_sha}`
          : `status claim ${input.status_claim} has no readback bound to resulting head ${input.resulting_head_sha}`,
      ],
      "strip the status claim or attach a status readback for the resulting GitHub head",
      claimEvidence(acceptedCurrent),
    );
  }

  if (input.progress_class === "external_platform_embodiment") {
    if (input.live_head_before === input.resulting_head_sha) {
      return block(
        input,
        "block_unmoved_embodiment",
        [`visible release claims embodiment but head did not move from ${input.live_head_before}`],
        "complete a GitHub contents write that moves the PR head before release",
        claimEvidence(acceptedCurrent),
      );
    }

    const blockers = incompleteEmbodimentEvidence(input);
    if (blockers.length > 0) {
      return block(
        input,
        "block_incomplete_evidence",
        blockers,
        "attach executable, routing, and proof evidence before publishing the embodiment release",
        claimEvidence(acceptedCurrent),
      );
    }
  }

  if (input.progress_class === "exact_external_blocker" && !input.exact_blocker?.trim()) {
    return block(
      input,
      "block_missing_exact_blocker",
      ["visible release exact-blocker class has no blocker text"],
      "name the exact external blocker or choose embodiment/status readback",
      claimEvidence(acceptedCurrent),
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_visible_release_citation",
    decisive_evidence: [
      `${input.repository_full_name}#${input.pr_number}`,
      input.active_branch,
      `current head ${input.resulting_head_sha}`,
      ...(input.prompt_head_sha && input.prompt_head_sha !== input.resulting_head_sha
        ? [`prompt head preserved as historical ${input.prompt_head_sha}`]
        : []),
      ...unique(input.changed_files.filter(executablePlatformPath)),
      ...input.executable_artifacts,
      ...input.routing_artifacts,
      ...input.proof_artifacts,
      ...(input.status_claim === "none"
        ? ["no pass/fail status claim made for the resulting head"]
        : [`status ${input.status_claim} bound to ${input.resulting_head_sha}`]),
      ...claimEvidence(acceptedCurrent),
    ],
    blockers: [],
    next_route: "publish the visible release with only the resulting GitHub head as current; read status for that head before any pass/fail claim",
  };
}
