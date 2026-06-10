export type LiveStatusEvidenceKind =
  | "check_run"
  | "workflow_run"
  | "combined_status"
  | "issue_published_readback"
  | "pr_body_summary"
  | "prompt_carried_summary"
  | "memory_receipt";

export type LiveStatusEvidenceVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export type LiveStatusAuthorityAction =
  | "accept_live_status_evidence"
  | "hold_for_live_status"
  | "repair_live_failure"
  | "block_stale_status_evidence"
  | "block_summary_as_status";

export interface LiveStatusEvidenceSurface {
  surface_id: string;
  kind: LiveStatusEvidenceKind;
  head_sha?: string;
  verdict: LiveStatusEvidenceVerdict;
  decisive_items: string[];
  warnings: string[];
}

export interface LiveStatusAuthorityInput {
  branch: string;
  active_branch: string;
  live_head_sha: string;
  evidence: LiveStatusEvidenceSurface[];
}

export interface LiveStatusAuthorityVerdict {
  ok: boolean;
  action: LiveStatusAuthorityAction;
  branch: string;
  head_sha: string;
  accepted_surface_ids: string[];
  stale_surface_ids: string[];
  summary_surface_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const DIRECT_STATUS_KINDS = new Set<LiveStatusEvidenceKind>([
  "check_run",
  "workflow_run",
  "combined_status",
  "issue_published_readback",
]);

const SUMMARY_STATUS_KINDS = new Set<LiveStatusEvidenceKind>([
  "pr_body_summary",
  "prompt_carried_summary",
  "memory_receipt",
]);

function base(input: LiveStatusAuthorityInput): Pick<LiveStatusAuthorityVerdict, "branch" | "head_sha"> {
  return { branch: input.branch, head_sha: input.live_head_sha };
}

function directLiveSurfaces(input: LiveStatusAuthorityInput): LiveStatusEvidenceSurface[] {
  return input.evidence.filter(
    (surface) => DIRECT_STATUS_KINDS.has(surface.kind) && surface.head_sha === input.live_head_sha,
  );
}

function staleSurfaces(input: LiveStatusAuthorityInput): LiveStatusEvidenceSurface[] {
  return input.evidence.filter(
    (surface) => DIRECT_STATUS_KINDS.has(surface.kind) && Boolean(surface.head_sha) && surface.head_sha !== input.live_head_sha,
  );
}

function summarySurfaces(input: LiveStatusAuthorityInput): LiveStatusEvidenceSurface[] {
  return input.evidence.filter((surface) => SUMMARY_STATUS_KINDS.has(surface.kind));
}

function decisiveEvidence(surfaces: LiveStatusEvidenceSurface[]): string[] {
  return surfaces.flatMap((surface) => [
    `${surface.surface_id}:${surface.kind}:${surface.verdict}`,
    ...surface.decisive_items,
  ]);
}

function warnings(surfaces: LiveStatusEvidenceSurface[]): string[] {
  return surfaces.flatMap((surface) => surface.warnings);
}

function block(
  input: LiveStatusAuthorityInput,
  action: Exclude<LiveStatusAuthorityAction, "accept_live_status_evidence" | "repair_live_failure">,
  blockers: string[],
  nextRoute: string,
): LiveStatusAuthorityVerdict {
  const stale = staleSurfaces(input);
  const summaries = summarySurfaces(input);
  return {
    ...base(input),
    ok: false,
    action,
    accepted_surface_ids: [],
    stale_surface_ids: stale.map((surface) => surface.surface_id),
    summary_surface_ids: summaries.map((surface) => surface.surface_id),
    decisive_evidence: [],
    blockers,
    warnings: warnings(input.evidence),
    next_route: nextRoute,
  };
}

export function compileLiveStatusAuthority(input: LiveStatusAuthorityInput): LiveStatusAuthorityVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_stale_status_evidence",
      [`status authority branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind status authority to the active PR branch before accepting any status surface",
    );
  }

  const live = directLiveSurfaces(input);
  const stale = staleSurfaces(input);
  const summaries = summarySurfaces(input);

  if (live.length === 0) {
    if (summaries.length > 0 || stale.length > 0) {
      return block(
        input,
        summaries.length > 0 ? "block_summary_as_status" : "block_stale_status_evidence",
        [
          ...summaries.map((surface) => `summary surface cannot prove live-head status: ${surface.surface_id}`),
          ...stale.map((surface) => `status surface ${surface.surface_id} belongs to ${surface.head_sha}`),
        ],
        "obtain check-run, workflow-run, combined-status, or issue-published readback evidence bound to the live head",
      );
    }

    return block(
      input,
      "hold_for_live_status",
      [`no live-head status evidence is attached for ${input.live_head_sha}`],
      "read a live-head status surface before making a pass/fail claim",
    );
  }

  const failures = live.filter((surface) => surface.verdict === "failing");
  if (failures.length > 0) {
    return {
      ...base(input),
      ok: false,
      action: "repair_live_failure",
      accepted_surface_ids: failures.map((surface) => surface.surface_id),
      stale_surface_ids: stale.map((surface) => surface.surface_id),
      summary_surface_ids: summaries.map((surface) => surface.surface_id),
      decisive_evidence: decisiveEvidence(failures),
      blockers: failures.flatMap((surface) =>
        surface.decisive_items.length > 0 ? surface.decisive_items : [`live-head status failed on ${surface.surface_id}`],
      ),
      warnings: warnings(live),
      next_route: "repair only the live-head-bound failure evidence, then require moved-head status readback",
    };
  }

  const pending = live.filter((surface) => surface.verdict === "pending" || surface.verdict === "unknown");
  if (pending.length > 0) {
    return {
      ...base(input),
      ok: false,
      action: "hold_for_live_status",
      accepted_surface_ids: pending.map((surface) => surface.surface_id),
      stale_surface_ids: stale.map((surface) => surface.surface_id),
      summary_surface_ids: summaries.map((surface) => surface.surface_id),
      decisive_evidence: decisiveEvidence(pending),
      blockers: pending.flatMap((surface) =>
        surface.decisive_items.length > 0 ? surface.decisive_items : [`live-head status is ${surface.verdict}`],
      ),
      warnings: warnings(live),
      next_route: "wait for live-head status completion before release",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_live_status_evidence",
    accepted_surface_ids: live.map((surface) => surface.surface_id),
    stale_surface_ids: stale.map((surface) => surface.surface_id),
    summary_surface_ids: summaries.map((surface) => surface.surface_id),
    decisive_evidence: decisiveEvidence(live),
    blockers: [],
    warnings: warnings(live),
    next_route: "continue from live-head-bound status evidence without inheriting stale prompt or PR-body summaries",
  };
}
