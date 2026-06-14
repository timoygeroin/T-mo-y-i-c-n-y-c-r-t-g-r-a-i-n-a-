export type LiveFailureSurfaceKind =
  | "live_pr_metadata"
  | "direct_status_surface"
  | "pr_body_failure_summary"
  | "prompt_head_claim"
  | "memory_receipt";

export type LiveFailureStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export type LiveFailureMoveClass =
  | "external_platform_embodiment"
  | "current_failure_repair"
  | "fresh_status_readback"
  | "exact_external_blocker";

export type LiveFailureReleaseAction =
  | "admit_statusless_embodiment"
  | "admit_current_failure_repair"
  | "admit_fresh_status_readback"
  | "emit_exact_external_blocker"
  | "require_live_metadata"
  | "block_branch_mismatch"
  | "block_stale_candidate_base"
  | "block_pending_status"
  | "block_live_failure_embodiment"
  | "block_failure_detail_missing"
  | "block_incomplete_candidate";

export interface LiveFailureSurface {
  surface_id: string;
  kind: LiveFailureSurfaceKind;
  branch: string;
  head_sha?: string;
  status_verdict?: LiveFailureStatusVerdict;
  evidence: string[];
  failure_detail?: string;
}

export interface LiveFailureCandidate {
  move_class: LiveFailureMoveClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  failure_signature?: string;
  blocker?: string;
}

export interface LiveFailureReleaseArbiterInput {
  active_branch: string;
  live_head_sha: string;
  resolved_historical_heads: string[];
  surfaces: LiveFailureSurface[];
  candidate: LiveFailureCandidate;
}

export interface LiveFailureReleaseArbiterVerdict {
  ok: boolean;
  action: LiveFailureReleaseAction;
  branch: string;
  head_sha: string;
  live_surface_ids: string[];
  stale_surface_ids: string[];
  historical_surface_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const SUMMARY_KINDS = new Set<LiveFailureSurfaceKind>([
  "pr_body_failure_summary",
  "prompt_head_claim",
  "memory_receipt",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function isProofOnly(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function onLiveHead(input: LiveFailureReleaseArbiterInput, surface: LiveFailureSurface): boolean {
  return surface.branch === input.active_branch && surface.head_sha === input.live_head_sha;
}

function classify(input: LiveFailureReleaseArbiterInput): Pick<
  LiveFailureReleaseArbiterVerdict,
  "live_surface_ids" | "stale_surface_ids" | "historical_surface_ids"
> {
  const live: string[] = [];
  const stale: string[] = [];
  const historical: string[] = [];

  for (const surface of input.surfaces) {
    if (onLiveHead(input, surface) && !SUMMARY_KINDS.has(surface.kind)) {
      live.push(surface.surface_id);
      continue;
    }

    if (surface.head_sha && input.resolved_historical_heads.includes(surface.head_sha)) {
      historical.push(surface.surface_id);
      continue;
    }

    if (surface.head_sha && surface.head_sha !== input.live_head_sha) stale.push(surface.surface_id);
    if (!surface.head_sha && SUMMARY_KINDS.has(surface.kind)) stale.push(surface.surface_id);
  }

  return {
    live_surface_ids: [...new Set(live)],
    stale_surface_ids: [...new Set(stale)],
    historical_surface_ids: [...new Set(historical)],
  };
}

function base(input: LiveFailureReleaseArbiterInput): Pick<LiveFailureReleaseArbiterVerdict, "branch" | "head_sha"> {
  return { branch: input.active_branch, head_sha: input.live_head_sha };
}

function block(
  input: LiveFailureReleaseArbiterInput,
  action: Exclude<
    LiveFailureReleaseAction,
    | "admit_statusless_embodiment"
    | "admit_current_failure_repair"
    | "admit_fresh_status_readback"
    | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): LiveFailureReleaseArbiterVerdict {
  return {
    ...base(input),
    ...classify(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function liveMetadata(input: LiveFailureReleaseArbiterInput): LiveFailureSurface[] {
  return input.surfaces.filter((surface) => surface.kind === "live_pr_metadata" && onLiveHead(input, surface));
}

function liveStatus(input: LiveFailureReleaseArbiterInput): LiveFailureSurface[] {
  return input.surfaces.filter((surface) => surface.kind === "direct_status_surface" && onLiveHead(input, surface));
}

function liveFailingStatus(input: LiveFailureReleaseArbiterInput): LiveFailureSurface[] {
  return liveStatus(input).filter((surface) => surface.status_verdict === "failing");
}

function livePendingStatus(input: LiveFailureReleaseArbiterInput): LiveFailureSurface[] {
  return liveStatus(input).filter((surface) => surface.status_verdict === "pending");
}

function livePassingStatus(input: LiveFailureReleaseArbiterInput): LiveFailureSurface[] {
  return liveStatus(input).filter(
    (surface) => surface.status_verdict === "passing" || surface.status_verdict === "passing_with_warnings",
  );
}

function candidateBlockers(candidate: LiveFailureCandidate): string[] {
  const executable = candidate.changed_files.filter(executablePlatformPath);
  const behavior = executable.filter((path) => !isProofOnly(path));
  const blockers: string[] = [];

  if (executable.length === 0) blockers.push("candidate changes no executable platform file");
  if (executable.length > 0 && behavior.length === 0) blockers.push("candidate is proof-only and changes no behavior file");
  if (candidate.executable_artifacts.length === 0) blockers.push("candidate has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("candidate has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("candidate has no proof artifact evidence");

  return blockers;
}

function failureDetails(surfaces: LiveFailureSurface[]): string[] {
  return surfaces.map((surface) => surface.failure_detail?.trim()).filter((detail): detail is string => Boolean(detail));
}

export function arbitrateLiveFailureRelease(
  input: LiveFailureReleaseArbiterInput,
): LiveFailureReleaseArbiterVerdict {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the release candidate to the active PR branch before finalization",
    );
  }

  const metadata = liveMetadata(input);
  if (metadata.length === 0) {
    return block(
      input,
      "require_live_metadata",
      [`no live PR metadata surface is bound to ${input.active_branch}@${input.live_head_sha}`],
      "read live PR metadata before accepting prompt, memory, or PR-body status claims",
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_candidate_base",
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the candidate to the live PR head before moving the branch",
      metadata.flatMap((surface) => surface.evidence),
    );
  }

  const pending = livePendingStatus(input);
  if (pending.length > 0) {
    return block(
      input,
      "block_pending_status",
      pending.flatMap((surface) => (surface.evidence.length > 0 ? surface.evidence : [`pending status ${surface.surface_id}`])),
      "wait for the live-head status surface to finish before repair, readback, or embodiment",
      pending.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
    );
  }

  const failures = liveFailingStatus(input);
  if (failures.length > 0) {
    const details = failureDetails(failures);

    if (candidate.move_class === "exact_external_blocker") {
      const blocker = candidate.blocker?.trim() || "live-head failure exists without an admitted repair candidate";
      return {
        ...base(input),
        ...classify(input),
        ok: true,
        action: "emit_exact_external_blocker",
        decisive_evidence: [blocker, ...failures.flatMap((surface) => [surface.surface_id, ...surface.evidence])],
        blockers: [blocker],
        next_route: "resolve the live-head blocker before another embodiment claim",
      };
    }

    if (candidate.move_class !== "current_failure_repair") {
      return block(
        input,
        "block_live_failure_embodiment",
        failures.flatMap((surface) => (surface.evidence.length > 0 ? surface.evidence : [`live failing status ${surface.surface_id}`])),
        "route to current-failure repair or exact external blocker before unrelated embodiment",
        failures.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      );
    }

    if (details.length === 0 || !candidate.failure_signature?.trim()) {
      return block(
        input,
        "block_failure_detail_missing",
        ["live-head failure has no concrete failure detail bound to the repair candidate"],
        "obtain the failing assertion/log detail before mutating repair code",
        failures.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      );
    }

    const blockers = candidateBlockers(candidate);
    if (blockers.length > 0) {
      return block(input, "block_incomplete_candidate", blockers, "supply executable repair, routing, and proof evidence");
    }

    return {
      ...base(input),
      ...classify(input),
      ok: true,
      action: "admit_current_failure_repair",
      decisive_evidence: [
        ...details,
        candidate.failure_signature,
        ...candidate.changed_files.filter(executablePlatformPath),
        ...candidate.executable_artifacts,
        ...candidate.routing_artifacts,
        ...candidate.proof_artifacts,
      ],
      blockers: [],
      next_route: "commit the live-head repair, then require status readback for the moved head",
    };
  }

  const passing = livePassingStatus(input);
  if (candidate.move_class === "fresh_status_readback" && passing.length > 0) {
    return {
      ...base(input),
      ...classify(input),
      ok: true,
      action: "admit_fresh_status_readback",
      decisive_evidence: passing.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      blockers: [],
      next_route: "publish the live-head status readback, then select the next non-repeated embodiment",
    };
  }

  if (candidate.move_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    return {
      ...base(input),
      ...classify(input),
      ok: Boolean(blocker),
      action: "emit_exact_external_blocker",
      decisive_evidence: blocker ? [blocker, `live head ${input.live_head_sha}`] : [`live head ${input.live_head_sha}`],
      blockers: blocker ? [blocker] : ["exact external blocker candidate has no blocker text"],
      next_route: blocker
        ? "resolve the named blocker before another finalization progress claim"
        : "name one exact blocker or choose an executable embodiment",
    };
  }

  const blockers = candidateBlockers(candidate);
  if (blockers.length > 0) {
    return block(input, "block_incomplete_candidate", blockers, "supply behavior, routing, and proof evidence");
  }

  return {
    ...base(input),
    ...classify(input),
    ok: true,
    action: "admit_statusless_embodiment",
    decisive_evidence: [
      ...metadata.flatMap((surface) => surface.evidence),
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the statusless embodiment, then bind the next readback to the moved head",
  };
}
