export type HeadLineageSurfaceKind =
  | "user_instruction"
  | "pr_metadata"
  | "status_readback"
  | "contents_write_result"
  | "workflow_run";

export type HeadLineageStatusClaim = "none" | "passing" | "passing_with_warnings" | "pending" | "failing";

export type HeadLineageAction =
  | "record_live_head_lineage"
  | "record_post_write_lineage"
  | "block_branch_mismatch"
  | "block_missing_live_head"
  | "block_unmoved_write_head"
  | "block_stale_status_claim"
  | "block_missing_lineage_surface";

export interface HeadLineageSurface {
  surface_id: string;
  kind: HeadLineageSurfaceKind;
  branch: string;
  head_sha: string;
  evidence: string[];
}

export interface HeadLineageLedgerInput {
  active_branch: string;
  instruction_head_sha?: string;
  live_head_sha: string;
  previous_status_head_sha?: string;
  pre_write_head_sha?: string;
  resulting_head_sha?: string;
  status_claim: HeadLineageStatusClaim;
  status_claim_head_sha?: string;
  surfaces: HeadLineageSurface[];
}

export interface HeadLineageLedgerVerdict {
  ok: boolean;
  action: HeadLineageAction;
  branch: string;
  current_head_sha: string;
  retired_head_shas: string[];
  required_status_head_sha: string;
  accepted_surface_ids: string[];
  quarantined_surface_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function currentHead(input: HeadLineageLedgerInput): string {
  return input.resulting_head_sha ?? input.live_head_sha;
}

function retiredHeads(input: HeadLineageLedgerInput): string[] {
  const current = currentHead(input);
  return unique([
    input.instruction_head_sha ?? "",
    input.previous_status_head_sha ?? "",
    input.pre_write_head_sha ?? "",
    input.live_head_sha,
  ]).filter((head) => head !== current);
}

function acceptedSurfaces(input: HeadLineageLedgerInput): HeadLineageSurface[] {
  const current = currentHead(input);
  return input.surfaces.filter((surface) => surface.branch === input.active_branch && surface.head_sha === current);
}

function quarantinedSurfaces(input: HeadLineageLedgerInput): HeadLineageSurface[] {
  const current = currentHead(input);
  return input.surfaces.filter((surface) => surface.branch !== input.active_branch || surface.head_sha !== current);
}

function base(input: HeadLineageLedgerInput): Pick<
  HeadLineageLedgerVerdict,
  "branch" | "current_head_sha" | "retired_head_shas" | "required_status_head_sha" | "accepted_surface_ids" | "quarantined_surface_ids"
> {
  const current = currentHead(input);
  return {
    branch: input.active_branch,
    current_head_sha: current,
    retired_head_shas: retiredHeads(input),
    required_status_head_sha: current,
    accepted_surface_ids: acceptedSurfaces(input).map((surface) => surface.surface_id),
    quarantined_surface_ids: quarantinedSurfaces(input).map((surface) => surface.surface_id),
  };
}

function block(
  input: HeadLineageLedgerInput,
  action: Exclude<HeadLineageAction, "record_live_head_lineage" | "record_post_write_lineage">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): HeadLineageLedgerVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function compileHeadLineageLedger(input: HeadLineageLedgerInput): HeadLineageLedgerVerdict {
  if (!input.live_head_sha.trim()) {
    return block(
      input,
      "block_missing_live_head",
      ["head lineage ledger has no live PR head"],
      "read live PR metadata before compiling a head lineage ledger",
    );
  }

  const wrongBranch = input.surfaces.find((surface) => surface.branch !== input.active_branch);
  if (wrongBranch) {
    return block(
      input,
      "block_branch_mismatch",
      [`lineage surface ${wrongBranch.surface_id} belongs to ${wrongBranch.branch}, not ${input.active_branch}`],
      "drop cross-branch surfaces before compiling the active PR lineage",
    );
  }

  if (input.resulting_head_sha && input.pre_write_head_sha && input.resulting_head_sha === input.pre_write_head_sha) {
    return block(
      input,
      "block_unmoved_write_head",
      [`contents write did not move head beyond ${input.pre_write_head_sha}`],
      "do not record post-write lineage until the external branch head changes",
    );
  }

  const current = currentHead(input);
  if (input.status_claim !== "none" && input.status_claim_head_sha !== current) {
    return block(
      input,
      "block_stale_status_claim",
      [
        input.status_claim_head_sha
          ? `status claim ${input.status_claim} belongs to ${input.status_claim_head_sha}, not current head ${current}`
          : `status claim ${input.status_claim} has no head binding for ${current}`,
      ],
      "quarantine the stale status claim and open a status cursor for the current head",
    );
  }

  const accepted = acceptedSurfaces(input);
  if (accepted.length === 0) {
    return block(
      input,
      "block_missing_lineage_surface",
      [`no lineage surface is bound to ${input.active_branch}@${current}`],
      "attach at least one live PR metadata, write-result, workflow, or status surface for the current head",
    );
  }

  const postWrite = Boolean(input.resulting_head_sha);
  return {
    ...base(input),
    ok: true,
    action: postWrite ? "record_post_write_lineage" : "record_live_head_lineage",
    decisive_evidence: [
      `current head ${current}`,
      ...retiredHeads(input).map((head) => `retired head ${head}`),
      ...accepted.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      ...(input.status_claim === "none" ? ["no status claim attached to current head"] : [`status ${input.status_claim} bound to ${current}`]),
    ],
    blockers: [],
    next_route: input.status_claim === "none"
      ? `read status only for ${current} before any pass/fail claim`
      : "continue from the current status-bound head without reviving retired heads",
  };
}
