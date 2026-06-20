export type CurrentTurnSurfaceKind =
  | "direct_current_instruction"
  | "live_pr_metadata"
  | "direct_status_surface"
  | "pr_body_summary"
  | "memory_receipt"
  | "issue_state"
  | "local_workspace";

export type CurrentTurnStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export type CurrentTurnMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "pr_metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_resolved_blocker"
  | "old_repaired_head_blocker";

export type CurrentTurnManifestationAction =
  | "admit_external_embodiment"
  | "admit_fresh_status_readback"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_non_progress_move"
  | "block_stale_prompt_head"
  | "block_missing_live_metadata"
  | "block_stale_status_surface"
  | "block_status_summary_only"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export interface CurrentTurnSurfaceObservation {
  surface_id: string;
  kind: CurrentTurnSurfaceKind;
  branch: string;
  head_sha?: string;
  status_verdict?: CurrentTurnStatusVerdict;
  evidence: string[];
}

export interface CurrentTurnCandidate {
  move_class: CurrentTurnMoveClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
}

export interface CurrentTurnManifestationGateInput {
  active_branch: string;
  live_head_sha: string;
  prompt_head_sha: string;
  last_status_readback_head_sha?: string;
  resolved_historical_heads: string[];
  observations: CurrentTurnSurfaceObservation[];
  prohibited_move_classes: CurrentTurnMoveClass[];
  candidate: CurrentTurnCandidate;
}

export interface CurrentTurnManifestationGateVerdict {
  ok: boolean;
  action: CurrentTurnManifestationAction;
  branch: string;
  head_sha: string;
  accepted_surface_ids: string[];
  stale_surface_ids: string[];
  summary_surface_ids: string[];
  quarantined_head_shas: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_MOVE_CLASSES = new Set<CurrentTurnMoveClass>([
  "pr_metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_resolved_blocker",
  "old_repaired_head_blocker",
]);

const SUMMARY_SURFACE_KINDS = new Set<CurrentTurnSurfaceKind>(["pr_body_summary", "memory_receipt", "local_workspace"]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function onLiveHead(input: CurrentTurnManifestationGateInput, surface: CurrentTurnSurfaceObservation): boolean {
  return surface.branch === input.active_branch && surface.head_sha === input.live_head_sha;
}

function classifySurfaces(input: CurrentTurnManifestationGateInput): Pick<
  CurrentTurnManifestationGateVerdict,
  "accepted_surface_ids" | "stale_surface_ids" | "summary_surface_ids" | "quarantined_head_shas"
> {
  const accepted: string[] = [];
  const stale: string[] = [];
  const summary: string[] = [];
  const quarantined = new Set(input.resolved_historical_heads.filter((head) => head !== input.live_head_sha));

  if (input.prompt_head_sha !== input.live_head_sha) quarantined.add(input.prompt_head_sha);
  if (input.last_status_readback_head_sha && input.last_status_readback_head_sha !== input.live_head_sha) {
    quarantined.add(input.last_status_readback_head_sha);
  }

  for (const surface of input.observations) {
    if (SUMMARY_SURFACE_KINDS.has(surface.kind)) summary.push(surface.surface_id);
    if (surface.head_sha && surface.head_sha !== input.live_head_sha) stale.push(surface.surface_id);
    if (onLiveHead(input, surface) && !SUMMARY_SURFACE_KINDS.has(surface.kind)) accepted.push(surface.surface_id);
  }

  return {
    accepted_surface_ids: [...new Set(accepted)],
    stale_surface_ids: [...new Set(stale)],
    summary_surface_ids: [...new Set(summary)],
    quarantined_head_shas: [...quarantined],
  };
}

function base(input: CurrentTurnManifestationGateInput): Pick<
  CurrentTurnManifestationGateVerdict,
  "branch" | "head_sha"
> {
  return { branch: input.active_branch, head_sha: input.live_head_sha };
}

function block(
  input: CurrentTurnManifestationGateInput,
  action: Exclude<
    CurrentTurnManifestationAction,
    "admit_external_embodiment" | "admit_fresh_status_readback" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): CurrentTurnManifestationGateVerdict {
  return {
    ...base(input),
    ...classifySurfaces(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function liveMetadata(input: CurrentTurnManifestationGateInput): CurrentTurnSurfaceObservation[] {
  return input.observations.filter((surface) => surface.kind === "live_pr_metadata" && onLiveHead(input, surface));
}

function liveDirectStatus(input: CurrentTurnManifestationGateInput): CurrentTurnSurfaceObservation[] {
  return input.observations.filter((surface) => surface.kind === "direct_status_surface" && onLiveHead(input, surface));
}

function staleStatusSummary(input: CurrentTurnManifestationGateInput): CurrentTurnSurfaceObservation[] {
  return input.observations.filter(
    (surface) => SUMMARY_SURFACE_KINDS.has(surface.kind) && Boolean(surface.status_verdict) && surface.head_sha !== input.live_head_sha,
  );
}

function embodimentBlockers(candidate: CurrentTurnCandidate): string[] {
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (executableChanges.length === 0) blockers.push("current turn embodiment changes no executable platform file");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("current turn embodiment is proof-only and has no behavior file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("current turn embodiment has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("current turn embodiment has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("current turn embodiment has no proof artifact evidence");

  return blockers;
}

export function gateCurrentTurnManifestation(
  input: CurrentTurnManifestationGateInput,
): CurrentTurnManifestationGateVerdict {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the current turn candidate to the active manifestation branch",
    );
  }

  const metadata = liveMetadata(input);
  if (metadata.length === 0) {
    return block(
      input,
      "block_missing_live_metadata",
      [`no live PR metadata surface is bound to ${input.active_branch}@${input.live_head_sha}`],
      "read live PR metadata before any current-turn progress claim",
    );
  }

  if (NON_PROGRESS_MOVE_CLASSES.has(candidate.move_class) || input.prohibited_move_classes.includes(candidate.move_class)) {
    return block(
      input,
      "block_non_progress_move",
      [`current turn candidate is not terminal progress: ${candidate.move_class}`],
      "choose external embodiment, fresh live-head status readback, or one exact external blocker",
      [candidate.move_class, ...metadata.flatMap((surface) => surface.evidence)],
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_prompt_head",
      [`candidate base ${candidate.base_head_sha} is not live PR head ${input.live_head_sha}`],
      "rebase the current turn candidate to the live head and keep prompt-carried heads quarantined",
      metadata.flatMap((surface) => surface.evidence),
    );
  }

  if (candidate.move_class === "fresh_status_readback") {
    const directStatus = liveDirectStatus(input);
    if (directStatus.length === 0) {
      const staleSummary = staleStatusSummary(input);
      return block(
        input,
        staleSummary.length > 0 ? "block_status_summary_only" : "block_stale_status_surface",
        staleSummary.length > 0
          ? staleSummary.map((surface) => `summary surface cannot authorize current status: ${surface.surface_id}`)
          : [`no direct status surface is bound to live head ${input.live_head_sha}`],
        "obtain a direct live-head Checks or Actions surface before publishing status readback",
        staleSummary.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      );
    }

    return {
      ...base(input),
      ...classifySurfaces(input),
      ok: true,
      action: "admit_fresh_status_readback",
      decisive_evidence: directStatus.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      blockers: [],
      next_route: "publish only the live-head status readback, then choose a non-repeated embodiment or exact blocker",
    };
  }

  if (candidate.move_class === "external_platform_embodiment") {
    const blockers = embodimentBlockers(candidate);
    if (blockers.length > 0) {
      return block(
        input,
        "block_incomplete_embodiment",
        blockers,
        "supply behavior-bearing executable, routing, and proof artifacts before branch write",
      );
    }

    return {
      ...base(input),
      ...classifySurfaces(input),
      ok: true,
      action: "admit_external_embodiment",
      decisive_evidence: [
        ...metadata.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
        ...candidate.changed_files.filter(executablePlatformPath),
        ...candidate.executable_artifacts,
        ...candidate.routing_artifacts,
        ...candidate.proof_artifacts,
      ],
      blockers: [],
      next_route: "commit the embodiment, then bind the next status readback to the resulting new head",
    };
  }

  const blocker = candidate.blocker?.trim();
  if (!blocker) {
    return block(
      input,
      "block_missing_exact_blocker",
      ["current turn exact blocker has no blocker text"],
      "name the exact live external blocker or choose a valid embodiment/readback route",
    );
  }

  return {
    ...base(input),
    ...classifySurfaces(input),
    ok: true,
    action: "emit_exact_external_blocker",
    decisive_evidence: [blocker, ...metadata.flatMap((surface) => [surface.surface_id, ...surface.evidence])],
    blockers: [blocker],
    next_route: "resolve the exact blocker before another manifestation move",
  };
}
