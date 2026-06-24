export type ScheduledCurrentHeadMandateMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "current_failure_repair"
  | "exact_external_blocker";

export type ScheduledCurrentHeadMandateSurfaceKind =
  | "live_pr_metadata"
  | "direct_status_surface"
  | "scheduled_prompt"
  | "pr_body_summary"
  | "memory_receipt";

export type ScheduledCurrentHeadMandateStatus = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export type ScheduledCurrentHeadMandateAction =
  | "compile_live_head_mandate"
  | "compile_live_head_status_mandate"
  | "compile_live_head_repair_mandate"
  | "compile_live_head_blocker_mandate"
  | "block_missing_live_metadata"
  | "block_stale_candidate_base"
  | "block_summary_as_authority"
  | "block_incomplete_candidate"
  | "block_missing_exact_blocker";

export interface ScheduledCurrentHeadMandateSurface {
  surface_id: string;
  kind: ScheduledCurrentHeadMandateSurfaceKind;
  branch: string;
  head_sha?: string;
  status?: ScheduledCurrentHeadMandateStatus;
  evidence: string[];
}

export interface ScheduledCurrentHeadMandateCandidate {
  move_class: ScheduledCurrentHeadMandateMoveClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
  failure_signature?: string;
}

export interface ScheduledCurrentHeadMandateInput {
  repository_full_name: string;
  pr_number: number;
  active_branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  last_status_head_sha?: string;
  resolved_historical_heads: string[];
  surfaces: ScheduledCurrentHeadMandateSurface[];
  candidate: ScheduledCurrentHeadMandateCandidate;
}

export interface ScheduledCurrentHeadMandateVerdict {
  ok: boolean;
  action: ScheduledCurrentHeadMandateAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  mandate: string | null;
  accepted_surface_ids: string[];
  quarantined_surface_ids: string[];
  historical_head_shas: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const SUMMARY_KINDS = new Set<ScheduledCurrentHeadMandateSurfaceKind>([
  "scheduled_prompt",
  "pr_body_summary",
  "memory_receipt",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function onLiveHead(input: ScheduledCurrentHeadMandateInput, surface: ScheduledCurrentHeadMandateSurface): boolean {
  return surface.branch === input.active_branch && surface.head_sha === input.live_head_sha;
}

function liveMetadata(input: ScheduledCurrentHeadMandateInput): ScheduledCurrentHeadMandateSurface[] {
  return input.surfaces.filter((surface) => surface.kind === "live_pr_metadata" && onLiveHead(input, surface));
}

function liveStatus(input: ScheduledCurrentHeadMandateInput): ScheduledCurrentHeadMandateSurface[] {
  return input.surfaces.filter((surface) => surface.kind === "direct_status_surface" && onLiveHead(input, surface));
}

function classify(input: ScheduledCurrentHeadMandateInput): Pick<
  ScheduledCurrentHeadMandateVerdict,
  "accepted_surface_ids" | "quarantined_surface_ids" | "historical_head_shas"
> {
  const accepted: string[] = [];
  const quarantined: string[] = [];
  const historical = new Set(input.resolved_historical_heads.filter((head) => head !== input.live_head_sha));

  if (input.prompt_head_sha !== input.live_head_sha) historical.add(input.prompt_head_sha);
  if (input.last_status_head_sha && input.last_status_head_sha !== input.live_head_sha) historical.add(input.last_status_head_sha);

  for (const surface of input.surfaces) {
    if (onLiveHead(input, surface) && !SUMMARY_KINDS.has(surface.kind)) {
      accepted.push(surface.surface_id);
      continue;
    }

    if (surface.head_sha && surface.head_sha !== input.live_head_sha) historical.add(surface.head_sha);
    if (SUMMARY_KINDS.has(surface.kind) || surface.head_sha || surface.branch !== input.active_branch) {
      quarantined.push(surface.surface_id);
    }
  }

  return {
    accepted_surface_ids: [...new Set(accepted)],
    quarantined_surface_ids: [...new Set(quarantined)],
    historical_head_shas: [...historical],
  };
}

function base(input: ScheduledCurrentHeadMandateInput): Pick<
  ScheduledCurrentHeadMandateVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function block(
  input: ScheduledCurrentHeadMandateInput,
  action: Exclude<
    ScheduledCurrentHeadMandateAction,
    | "compile_live_head_mandate"
    | "compile_live_head_status_mandate"
    | "compile_live_head_repair_mandate"
    | "compile_live_head_blocker_mandate"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ScheduledCurrentHeadMandateVerdict {
  return {
    ...base(input),
    ...classify(input),
    ok: false,
    action,
    mandate: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function incompleteExecutableCandidate(candidate: ScheduledCurrentHeadMandateCandidate): string[] {
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (candidate.branch.trim() === "") blockers.push("candidate has no branch");
  if (executableChanges.length === 0) blockers.push("candidate changes no executable platform file");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) blockers.push("candidate is proof-only and has no behavior file");
  if (candidate.executable_artifacts.length === 0) blockers.push("candidate has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("candidate has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("candidate has no proof artifact evidence");

  return blockers;
}

function mandateText(
  input: ScheduledCurrentHeadMandateInput,
  move: ScheduledCurrentHeadMandateMoveClass,
  nextRoute: string,
): string {
  const quarantined = classify(input).historical_head_shas;
  return [
    `Repository: ${input.repository_full_name}`,
    `PR: #${input.pr_number}`,
    `Branch: ${input.active_branch}`,
    `Current live head: ${input.live_head_sha}`,
    `Admitted next move: ${move}`,
    `Quarantined non-current heads: ${quarantined.length > 0 ? quarantined.join(", ") : "none"}`,
    "Do not reuse prompt-carried, PR-body, or memory heads as current unless live PR metadata confirms them.",
    nextRoute,
  ].join("\n");
}

export function compileScheduledCurrentHeadMandate(
  input: ScheduledCurrentHeadMandateInput,
): ScheduledCurrentHeadMandateVerdict {
  const metadata = liveMetadata(input);
  if (metadata.length === 0) {
    return block(
      input,
      "block_missing_live_metadata",
      [`no live PR metadata is bound to ${input.active_branch}@${input.live_head_sha}`],
      "read live PR metadata before compiling a replacement scheduled mandate",
    );
  }

  const summaryCurrentClaims = input.surfaces.filter(
    (surface) => SUMMARY_KINDS.has(surface.kind) && surface.head_sha === input.live_head_sha,
  );
  if (summaryCurrentClaims.length > 0 && metadata.length === 0) {
    return block(
      input,
      "block_summary_as_authority",
      summaryCurrentClaims.map((surface) => `summary surface cannot authorize current head: ${surface.surface_id}`),
      "replace summary authority with live PR metadata before mandate compilation",
    );
  }

  const candidate = input.candidate;
  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_stale_candidate_base",
      [`candidate branch ${candidate.branch} is not active branch ${input.active_branch}`],
      "rebind the mandate candidate to the active PR branch",
      metadata.flatMap((surface) => surface.evidence),
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_candidate_base",
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "compile the scheduled mandate only after rebasing the candidate to the live PR head",
      metadata.flatMap((surface) => surface.evidence),
    );
  }

  if (candidate.move_class === "fresh_status_readback") {
    const headMoved = input.last_status_head_sha !== input.live_head_sha;
    const status = liveStatus(input);
    if (!headMoved && status.length === 0) {
      return block(
        input,
        "block_incomplete_candidate",
        ["fresh status mandate requires a moved head or direct live-head status surface"],
        "wait for a moved head or attach a direct live-head status surface before mandate compilation",
        metadata.flatMap((surface) => surface.evidence),
      );
    }

    const nextRoute = "read status only for the live head named in this mandate, then choose embodiment or blocker from that result";
    return {
      ...base(input),
      ...classify(input),
      ok: true,
      action: "compile_live_head_status_mandate",
      mandate: mandateText(input, candidate.move_class, nextRoute),
      decisive_evidence: [
        ...metadata.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
        ...(headMoved ? [`head moved from ${input.last_status_head_sha ?? "<none>"} to ${input.live_head_sha}`] : []),
        ...status.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      ],
      blockers: [],
      next_route: nextRoute,
    };
  }

  if (candidate.move_class === "current_failure_repair") {
    const failures = liveStatus(input).filter((surface) => surface.status === "failing");
    if (failures.length === 0 || !candidate.failure_signature?.trim()) {
      return block(
        input,
        "block_incomplete_candidate",
        failures.length === 0
          ? ["repair mandate has no failing live-head status surface"]
          : ["repair mandate has no concrete live-head failure signature"],
        "compile repair mandates only from a direct failing status surface and concrete failure signature",
        metadata.flatMap((surface) => surface.evidence),
      );
    }

    const nextRoute = "repair only the concrete live-head failure, then require status readback for the moved head";
    return {
      ...base(input),
      ...classify(input),
      ok: true,
      action: "compile_live_head_repair_mandate",
      mandate: mandateText(input, candidate.move_class, nextRoute),
      decisive_evidence: [candidate.failure_signature, ...failures.flatMap((surface) => [surface.surface_id, ...surface.evidence])],
      blockers: [],
      next_route: nextRoute,
    };
  }

  if (candidate.move_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["exact blocker mandate has no blocker text"],
        "name one exact live-head blocker before compiling the scheduled mandate",
        metadata.flatMap((surface) => surface.evidence),
      );
    }

    const nextRoute = "resolve the named live-head blocker before another scheduled progress claim";
    return {
      ...base(input),
      ...classify(input),
      ok: true,
      action: "compile_live_head_blocker_mandate",
      mandate: mandateText(input, candidate.move_class, nextRoute),
      decisive_evidence: [blocker, ...metadata.flatMap((surface) => [surface.surface_id, ...surface.evidence])],
      blockers: [blocker],
      next_route: nextRoute,
    };
  }

  const blockers = incompleteExecutableCandidate(candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_candidate",
      blockers,
      "supply behavior-bearing executable, routing, and proof evidence before compiling an embodiment mandate",
      metadata.flatMap((surface) => surface.evidence),
    );
  }

  const nextRoute = "commit the live-head embodiment, then bind the next status readback to the resulting head";
  return {
    ...base(input),
    ...classify(input),
    ok: true,
    action: "compile_live_head_mandate",
    mandate: mandateText(input, candidate.move_class, nextRoute),
    decisive_evidence: [
      ...metadata.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: nextRoute,
  };
}
