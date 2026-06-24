export type ScheduledSurfaceKind =
  | "live_pr_metadata"
  | "direct_status_surface"
  | "scheduled_prompt"
  | "user_instruction"
  | "pr_body_summary"
  | "memory_receipt"
  | "issue_state";

export type ScheduledSurfaceStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export type ScheduledSurfaceMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "current_failure_repair"
  | "exact_external_blocker";

export type ScheduledSurfaceReconciliationAction =
  | "admit_live_head_embodiment"
  | "admit_live_status_readback"
  | "admit_live_failure_repair"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_missing_live_metadata"
  | "block_stale_candidate_base"
  | "block_stale_failure_repair"
  | "block_stale_status_readback"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export interface ScheduledSurfaceObservation {
  surface_id: string;
  kind: ScheduledSurfaceKind;
  branch: string;
  head_sha?: string;
  status_verdict?: ScheduledSurfaceStatusVerdict;
  evidence: string[];
}

export interface ScheduledSurfaceCandidate {
  move_class: ScheduledSurfaceMoveClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
  failure_signature?: string;
}

export interface ScheduledSurfaceReconciliationInput {
  active_branch: string;
  live_head_sha: string;
  scheduled_head_sha?: string;
  last_status_readback_head_sha?: string;
  resolved_historical_heads: string[];
  observations: ScheduledSurfaceObservation[];
  candidate: ScheduledSurfaceCandidate;
}

export interface ScheduledSurfaceReconciliationVerdict {
  ok: boolean;
  action: ScheduledSurfaceReconciliationAction;
  branch: string;
  head_sha: string;
  accepted_surface_ids: string[];
  stale_surface_ids: string[];
  summary_surface_ids: string[];
  historical_head_shas: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const SUMMARY_KINDS = new Set<ScheduledSurfaceKind>(["scheduled_prompt", "user_instruction", "pr_body_summary", "memory_receipt"]);
const DIRECT_STATUS_KINDS = new Set<ScheduledSurfaceKind>(["direct_status_surface"]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: ScheduledSurfaceReconciliationInput): Pick<ScheduledSurfaceReconciliationVerdict, "branch" | "head_sha"> {
  return { branch: input.active_branch, head_sha: input.live_head_sha };
}

function onLiveHead(input: ScheduledSurfaceReconciliationInput, surface: ScheduledSurfaceObservation): boolean {
  return surface.branch === input.active_branch && surface.head_sha === input.live_head_sha;
}

function historicalHeads(input: ScheduledSurfaceReconciliationInput): string[] {
  const heads = new Set(input.resolved_historical_heads.filter((head) => head !== input.live_head_sha));
  if (input.scheduled_head_sha && input.scheduled_head_sha !== input.live_head_sha) heads.add(input.scheduled_head_sha);
  if (input.last_status_readback_head_sha && input.last_status_readback_head_sha !== input.live_head_sha) {
    heads.add(input.last_status_readback_head_sha);
  }
  return [...heads];
}

function classify(input: ScheduledSurfaceReconciliationInput): Pick<
  ScheduledSurfaceReconciliationVerdict,
  "accepted_surface_ids" | "stale_surface_ids" | "summary_surface_ids" | "historical_head_shas"
> {
  const historical = historicalHeads(input);
  const accepted: string[] = [];
  const stale: string[] = [];
  const summary: string[] = [];

  for (const surface of input.observations) {
    if (onLiveHead(input, surface) && !SUMMARY_KINDS.has(surface.kind)) {
      accepted.push(surface.surface_id);
      continue;
    }

    if (SUMMARY_KINDS.has(surface.kind)) summary.push(surface.surface_id);
    if (surface.head_sha && surface.head_sha !== input.live_head_sha) stale.push(surface.surface_id);
  }

  return {
    accepted_surface_ids: accepted,
    stale_surface_ids: [...new Set(stale)],
    summary_surface_ids: [...new Set(summary)],
    historical_head_shas: historical,
  };
}

function block(
  input: ScheduledSurfaceReconciliationInput,
  action: Exclude<
    ScheduledSurfaceReconciliationAction,
    | "admit_live_head_embodiment"
    | "admit_live_status_readback"
    | "admit_live_failure_repair"
    | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ScheduledSurfaceReconciliationVerdict {
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

function liveMetadata(input: ScheduledSurfaceReconciliationInput): ScheduledSurfaceObservation[] {
  return input.observations.filter((surface) => surface.kind === "live_pr_metadata" && onLiveHead(input, surface));
}

function liveStatus(input: ScheduledSurfaceReconciliationInput): ScheduledSurfaceObservation[] {
  return input.observations.filter((surface) => DIRECT_STATUS_KINDS.has(surface.kind) && onLiveHead(input, surface));
}

function liveFailures(input: ScheduledSurfaceReconciliationInput): ScheduledSurfaceObservation[] {
  return liveStatus(input).filter((surface) => surface.status_verdict === "failing");
}

function staleFailureSummaries(input: ScheduledSurfaceReconciliationInput): ScheduledSurfaceObservation[] {
  return input.observations.filter(
    (surface) =>
      SUMMARY_KINDS.has(surface.kind) &&
      surface.status_verdict === "failing" &&
      Boolean(surface.head_sha) &&
      surface.head_sha !== input.live_head_sha,
  );
}

function incompleteEmbodiment(candidate: ScheduledSurfaceCandidate): string[] {
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (executableChanges.length === 0) blockers.push("scheduled embodiment changes no executable platform file");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("scheduled embodiment is proof-only and has no behavior file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("scheduled embodiment has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("scheduled embodiment has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("scheduled embodiment has no proof artifact evidence");

  return blockers;
}

export function reconcileScheduledSurface(
  input: ScheduledSurfaceReconciliationInput,
): ScheduledSurfaceReconciliationVerdict {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the scheduled continuation candidate to the active PR branch before release",
    );
  }

  const metadata = liveMetadata(input);
  if (metadata.length === 0) {
    return block(
      input,
      "block_missing_live_metadata",
      [`no live PR metadata surface is bound to ${input.active_branch}@${input.live_head_sha}`],
      "read live PR metadata before trusting scheduled prompt, user instruction, PR-body, or memory head claims",
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_candidate_base",
      [`candidate base ${candidate.base_head_sha} is not live PR head ${input.live_head_sha}`],
      "rebase the scheduled continuation to the live PR head; preserve stale scheduled and instruction heads only as historical context",
      metadata.flatMap((surface) => surface.evidence),
    );
  }

  if (candidate.move_class === "current_failure_repair") {
    const failures = liveFailures(input);
    if (failures.length === 0) {
      const staleSummaries = staleFailureSummaries(input);
      return block(
        input,
        "block_stale_failure_repair",
        staleSummaries.length > 0
          ? staleSummaries.map((surface) => `stale failure summary cannot authorize repair: ${surface.surface_id}`)
          : ["scheduled repair has no live-head failing status surface"],
        "obtain a direct failing status surface for the live head before repairing",
        staleSummaries.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      );
    }

    if (!candidate.failure_signature?.trim()) {
      return block(
        input,
        "block_stale_failure_repair",
        ["scheduled repair candidate has no live-head failure signature"],
        "bind the repair to the concrete live-head failure signature before writing code",
        failures.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      );
    }

    return {
      ...base(input),
      ...classify(input),
      ok: true,
      action: "admit_live_failure_repair",
      decisive_evidence: [
        candidate.failure_signature,
        ...failures.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
        ...candidate.changed_files.filter(executablePlatformPath),
        ...candidate.executable_artifacts,
        ...candidate.routing_artifacts,
        ...candidate.proof_artifacts,
      ],
      blockers: [],
      next_route: "repair the live-head failure, then require status readback for the moved head",
    };
  }

  if (candidate.move_class === "fresh_status_readback") {
    const headMovedSinceReadback = input.last_status_readback_head_sha !== input.live_head_sha;
    const status = liveStatus(input);
    if (!headMovedSinceReadback && status.length === 0) {
      return block(
        input,
        "block_stale_status_readback",
        ["scheduled status readback requires a moved live head or direct live-head status evidence"],
        "do not replay scheduled, user-instruction, or PR-body status summaries as fresh readback",
      );
    }

    return {
      ...base(input),
      ...classify(input),
      ok: true,
      action: "admit_live_status_readback",
      decisive_evidence: [
        ...(headMovedSinceReadback
          ? [`head moved from ${input.last_status_readback_head_sha ?? "<none>"} to ${input.live_head_sha}`]
          : []),
        ...status.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      ],
      blockers: [],
      next_route: "publish only the live-head status readback, then choose a non-repeated embodiment or exact blocker",
    };
  }

  if (candidate.move_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["scheduled exact-blocker candidate has no blocker text"],
        "name one exact live-head external blocker or choose embodiment/status readback",
      );
    }

    return {
      ...base(input),
      ...classify(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
      blockers: [blocker],
      next_route: "remove the named live-head blocker before another scheduled finalization progress claim",
    };
  }

  const blockers = incompleteEmbodiment(candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "supply behavior-bearing executable, routing, and proof evidence before moving the branch",
      metadata.flatMap((surface) => surface.evidence),
    );
  }

  return {
    ...base(input),
    ...classify(input),
    ok: true,
    action: "admit_live_head_embodiment",
    decisive_evidence: [
      ...metadata.flatMap((surface) => surface.evidence),
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the live-head scheduled embodiment, then bind the next status readback to the moved head",
  };
}
