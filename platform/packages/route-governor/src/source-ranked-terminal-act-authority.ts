export type TerminalActSurfaceKind =
  | "current_user_instruction"
  | "live_pr_metadata"
  | "direct_status_surface"
  | "github_check_run"
  | "issue_state"
  | "pr_body_summary"
  | "memory_receipt"
  | "model_summary";

export type TerminalActStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export type TerminalActClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_completed_blocker";

export type TerminalActAuthorityAction =
  | "authorize_external_platform_embodiment"
  | "authorize_fresh_status_readback"
  | "authorize_exact_external_blocker"
  | "block_non_progress_act"
  | "block_branch_mismatch"
  | "block_missing_live_pr_metadata"
  | "block_stale_base_head"
  | "block_incomplete_embodiment"
  | "block_stale_status_readback"
  | "block_missing_exact_blocker"
  | "block_repaired_head_blocker_reuse";

export interface TerminalActSurface {
  surface_id: string;
  kind: TerminalActSurfaceKind;
  branch: string;
  head_sha?: string;
  status_verdict?: TerminalActStatusVerdict;
  check_run_id?: string;
  evidence: string[];
}

export interface TerminalActCandidate {
  act_class: TerminalActClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  behavior_exports: string[];
  routing_effects: string[];
  proof_artifacts: string[];
  blocker?: string;
}

export interface SourceRankedTerminalActAuthorityInput {
  active_branch: string;
  live_head_sha: string;
  previous_status_head_sha?: string;
  resolved_repaired_head_shas: string[];
  prohibited_act_classes: TerminalActClass[];
  prohibited_blocker_fragments: string[];
  surfaces: TerminalActSurface[];
  candidate: TerminalActCandidate;
}

export interface SourceRankedTerminalActAuthorityVerdict {
  ok: boolean;
  action: TerminalActAuthorityAction;
  branch: string;
  head_sha: string;
  accepted_surface_ids: string[];
  stale_surface_ids: string[];
  summary_surface_ids: string[];
  retired_head_shas: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const SUMMARY_SURFACES = new Set<TerminalActSurfaceKind>([
  "pr_body_summary",
  "memory_receipt",
  "model_summary",
]);

const NON_PROGRESS_ACTS = new Set<TerminalActClass>([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function behaviorPath(path: string): boolean {
  return executablePlatformPath(path) && !proofOnlyPath(path) && !path.endsWith("/package.json");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isLiveSurface(input: SourceRankedTerminalActAuthorityInput, surface: TerminalActSurface): boolean {
  return surface.branch === input.active_branch && surface.head_sha === input.live_head_sha;
}

function acceptedSurfaces(input: SourceRankedTerminalActAuthorityInput): TerminalActSurface[] {
  return input.surfaces.filter((surface) => isLiveSurface(input, surface) && !SUMMARY_SURFACES.has(surface.kind));
}

function staleSurfaces(input: SourceRankedTerminalActAuthorityInput): TerminalActSurface[] {
  return input.surfaces.filter(
    (surface) => Boolean(surface.head_sha) && surface.head_sha !== input.live_head_sha,
  );
}

function summarySurfaces(input: SourceRankedTerminalActAuthorityInput): TerminalActSurface[] {
  return input.surfaces.filter((surface) => SUMMARY_SURFACES.has(surface.kind));
}

function retiredHeads(input: SourceRankedTerminalActAuthorityInput): string[] {
  const heads = new Set(input.resolved_repaired_head_shas.filter((head) => head !== input.live_head_sha));
  if (input.previous_status_head_sha && input.previous_status_head_sha !== input.live_head_sha) {
    heads.add(input.previous_status_head_sha);
  }
  for (const surface of staleSurfaces(input)) {
    if (surface.head_sha) heads.add(surface.head_sha);
  }
  return [...heads];
}

function base(input: SourceRankedTerminalActAuthorityInput): Pick<
  SourceRankedTerminalActAuthorityVerdict,
  "branch" | "head_sha" | "accepted_surface_ids" | "stale_surface_ids" | "summary_surface_ids" | "retired_head_shas"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    accepted_surface_ids: acceptedSurfaces(input).map((surface) => surface.surface_id),
    stale_surface_ids: staleSurfaces(input).map((surface) => surface.surface_id),
    summary_surface_ids: summarySurfaces(input).map((surface) => surface.surface_id),
    retired_head_shas: retiredHeads(input),
  };
}

function block(
  input: SourceRankedTerminalActAuthorityInput,
  action: Exclude<
    TerminalActAuthorityAction,
    "authorize_external_platform_embodiment" | "authorize_fresh_status_readback" | "authorize_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): SourceRankedTerminalActAuthorityVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function livePrMetadata(input: SourceRankedTerminalActAuthorityInput): TerminalActSurface[] {
  return acceptedSurfaces(input).filter((surface) => surface.kind === "live_pr_metadata");
}

function liveStatusEvidence(input: SourceRankedTerminalActAuthorityInput): TerminalActSurface[] {
  return acceptedSurfaces(input).filter(
    (surface) => surface.kind === "direct_status_surface" || surface.kind === "github_check_run",
  );
}

function newLiveCheckEvidence(input: SourceRankedTerminalActAuthorityInput): TerminalActSurface[] {
  return liveStatusEvidence(input).filter((surface) => Boolean(surface.check_run_id));
}

function incompleteEmbodiment(candidate: TerminalActCandidate): string[] {
  const blockers: string[] = [];
  const changedBehaviorFiles = candidate.changed_files.filter(behaviorPath);

  if (changedBehaviorFiles.length === 0) blockers.push("terminal act changes no behavior-bearing platform file");
  if (candidate.behavior_exports.length === 0) blockers.push("terminal act exposes no behavior export");
  if (candidate.routing_effects.length === 0) blockers.push("terminal act has no future-routing effect");
  if (candidate.proof_artifacts.length === 0) blockers.push("terminal act has no proof artifact");

  return blockers;
}

function blockerReusesRepairedHead(
  input: SourceRankedTerminalActAuthorityInput,
  blocker: string | undefined,
): boolean {
  const text = blocker?.trim();
  if (!text) return false;
  return input.prohibited_blocker_fragments.some((fragment) => fragment.trim() && text.includes(fragment.trim()));
}

export function authorizeSourceRankedTerminalAct(
  input: SourceRankedTerminalActAuthorityInput,
): SourceRankedTerminalActAuthorityVerdict {
  const candidate = input.candidate;
  const metadata = livePrMetadata(input);

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the terminal act to the active manifestation branch before release",
    );
  }

  if (input.prohibited_act_classes.includes(candidate.act_class) || NON_PROGRESS_ACTS.has(candidate.act_class)) {
    return block(
      input,
      "block_non_progress_act",
      [`terminal act class is not progress: ${candidate.act_class}`],
      "choose external embodiment, moved-head status readback, or one exact live external blocker",
      [candidate.act_class, ...input.prohibited_act_classes],
    );
  }

  if (metadata.length === 0) {
    return block(
      input,
      "block_missing_live_pr_metadata",
      [`no live PR metadata surface is bound to ${input.active_branch}@${input.live_head_sha}`],
      "read live PR metadata before trusting PR body, memory, model summaries, or stale repaired-head status",
      summarySurfaces(input).flatMap((surface) => [surface.surface_id, ...surface.evidence]),
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_base_head",
      [`candidate base ${candidate.base_head_sha} is not live PR head ${input.live_head_sha}`],
      "rebase the terminal act to the live PR head; keep older heads only as retired context",
      metadata.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
    );
  }

  if (candidate.act_class === "external_platform_embodiment") {
    const blockers = incompleteEmbodiment(candidate);
    if (blockers.length > 0) {
      return block(
        input,
        "block_incomplete_embodiment",
        blockers,
        "supply behavior-bearing code, behavior export, routing effect, and proof artifact before writing",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "authorize_external_platform_embodiment",
      decisive_evidence: unique([
        `live head ${input.live_head_sha}`,
        ...metadata.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
        ...candidate.changed_files.filter(behaviorPath),
        ...candidate.behavior_exports,
        ...candidate.routing_effects,
        ...candidate.proof_artifacts,
      ]),
      blockers: [],
      next_route: "write the embodiment, then require status authority for the moved post-write head before review or merge consumption",
    };
  }

  if (candidate.act_class === "fresh_status_readback") {
    const headMovedSinceStatus = input.previous_status_head_sha !== input.live_head_sha;
    const newChecks = newLiveCheckEvidence(input);
    if (!headMovedSinceStatus && newChecks.length === 0) {
      return block(
        input,
        "block_stale_status_readback",
        ["fresh status readback requires a moved head or new live-head check evidence"],
        "commit executable embodiment or emit the exact external blocker instead of replaying status",
        liveStatusEvidence(input).flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "authorize_fresh_status_readback",
      decisive_evidence: unique([
        ...(headMovedSinceStatus
          ? [`head moved from ${input.previous_status_head_sha ?? "<none>"} to ${input.live_head_sha}`]
          : []),
        ...newChecks.flatMap((surface) => [surface.surface_id, surface.check_run_id ?? "", ...surface.evidence]),
      ]),
      blockers: [],
      next_route: "read and publish only status bound to the live PR head; do not reuse repaired-head status authority",
    };
  }

  if (candidate.act_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["exact external blocker act has no blocker text"],
        "name the exact live external blocker or choose an authorized progress act",
      );
    }

    if (blockerReusesRepairedHead(input, blocker)) {
      return block(
        input,
        "block_repaired_head_blocker_reuse",
        [`exact blocker reuses a prohibited repaired-head fragment: ${blocker}`],
        "discard repaired-head blocker reuse and bind any blocker to the live PR head",
        [blocker, ...input.resolved_repaired_head_shas],
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "authorize_exact_external_blocker",
      decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
      blockers: [blocker],
      next_route: "remove the named live external blocker before claiming another finalization act",
    };
  }

  return block(
    input,
    "block_non_progress_act",
    [`terminal act class is not admitted: ${candidate.act_class}`],
    "choose external embodiment, moved-head status readback, or one exact live external blocker",
  );
}