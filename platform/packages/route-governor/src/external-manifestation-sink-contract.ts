export type ExternalManifestationSinkOperation =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "review_request"
  | "merge_command"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_comment"
  | "duplicate_ci_summary"
  | "old_repaired_head_blocker";

export type ExternalManifestationSinkAction =
  | "admit_sink_bound_embodiment"
  | "admit_sink_bound_status_readback"
  | "admit_sink_bound_review_request"
  | "admit_sink_bound_merge_command"
  | "emit_sink_bound_external_blocker"
  | "block_sink_mismatch"
  | "block_non_progress_operation"
  | "block_closed_or_draft_pr"
  | "block_stale_head_authority"
  | "block_unresolved_blocker_surface"
  | "block_missing_exact_blocker";

export interface ExternalManifestationSinkTarget {
  repository: string;
  pull_request: number;
  branch: string;
}

export interface ExternalManifestationSinkSurface {
  surface_id: string;
  repository: string;
  pull_request: number;
  branch: string;
  head_sha: string;
  state: "open" | "closed";
  draft: boolean;
  blocker_label_present: boolean;
  blocker_issue_open: boolean;
  evidence: string[];
}

export interface ExternalManifestationSinkCandidate {
  operation: ExternalManifestationSinkOperation;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
}

export interface ExternalManifestationSinkContractInput {
  target: ExternalManifestationSinkTarget;
  live_surface: ExternalManifestationSinkSurface;
  resolved_historical_heads: string[];
  prompt_carried_head_sha?: string;
  last_status_readback_head_sha?: string;
  candidate: ExternalManifestationSinkCandidate;
}

export interface ExternalManifestationSinkContractVerdict {
  ok: boolean;
  action: ExternalManifestationSinkAction;
  repository: string;
  pull_request: number;
  branch: string;
  live_head_sha: string;
  quarantined_head_shas: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_OPERATIONS = new Set<ExternalManifestationSinkOperation>([
  "metadata_reread",
  "duplicate_comment",
  "duplicate_ci_summary",
  "old_repaired_head_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function sameSink(target: ExternalManifestationSinkTarget, surface: ExternalManifestationSinkSurface): boolean {
  return (
    target.repository === surface.repository &&
    target.pull_request === surface.pull_request &&
    target.branch === surface.branch
  );
}

function quarantinedHeads(input: ExternalManifestationSinkContractInput): string[] {
  const heads = new Set(input.resolved_historical_heads.filter((head) => head !== input.live_surface.head_sha));
  if (input.prompt_carried_head_sha && input.prompt_carried_head_sha !== input.live_surface.head_sha) {
    heads.add(input.prompt_carried_head_sha);
  }
  if (input.last_status_readback_head_sha && input.last_status_readback_head_sha !== input.live_surface.head_sha) {
    heads.add(input.last_status_readback_head_sha);
  }
  if (input.candidate.base_head_sha !== input.live_surface.head_sha) heads.add(input.candidate.base_head_sha);
  return [...heads];
}

function base(input: ExternalManifestationSinkContractInput): Pick<
  ExternalManifestationSinkContractVerdict,
  "repository" | "pull_request" | "branch" | "live_head_sha" | "quarantined_head_shas"
> {
  return {
    repository: input.target.repository,
    pull_request: input.target.pull_request,
    branch: input.target.branch,
    live_head_sha: input.live_surface.head_sha,
    quarantined_head_shas: quarantinedHeads(input),
  };
}

function block(
  input: ExternalManifestationSinkContractInput,
  action: Exclude<
    ExternalManifestationSinkAction,
    | "admit_sink_bound_embodiment"
    | "admit_sink_bound_status_readback"
    | "admit_sink_bound_review_request"
    | "admit_sink_bound_merge_command"
    | "emit_sink_bound_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ExternalManifestationSinkContractVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(candidate: ExternalManifestationSinkCandidate): string[] {
  const executable = candidate.changed_files.filter(executablePlatformPath);
  const behavior = executable.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (executable.length === 0) blockers.push("sink-bound embodiment changes no executable platform file");
  if (executable.length > 0 && behavior.length === 0) {
    blockers.push("sink-bound embodiment is proof-only and has no behavior file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("sink-bound embodiment has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("sink-bound embodiment has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("sink-bound embodiment has no proof artifact evidence");

  return blockers;
}

function sinkEvidence(input: ExternalManifestationSinkContractInput): string[] {
  const surface = input.live_surface;
  return [
    surface.surface_id,
    `${surface.repository}#${surface.pull_request}`,
    `branch ${surface.branch}`,
    `live head ${surface.head_sha}`,
    ...surface.evidence,
  ];
}

export function enforceExternalManifestationSinkContract(
  input: ExternalManifestationSinkContractInput,
): ExternalManifestationSinkContractVerdict {
  const candidate = input.candidate;

  if (!sameSink(input.target, input.live_surface)) {
    return block(
      input,
      "block_sink_mismatch",
      [
        `live surface ${input.live_surface.repository}#${input.live_surface.pull_request}/${input.live_surface.branch} does not match target ${input.target.repository}#${input.target.pull_request}/${input.target.branch}`,
      ],
      "rebind the external act to the active manifestation sink before release",
      sinkEvidence(input),
    );
  }

  if (NON_PROGRESS_OPERATIONS.has(candidate.operation)) {
    return block(
      input,
      "block_non_progress_operation",
      [`sink-bound operation is non-progress: ${candidate.operation}`],
      "choose a sink-bound embodiment, live-head status readback, review request, merge command, or exact blocker",
      sinkEvidence(input),
    );
  }

  if (input.live_surface.state !== "open" || input.live_surface.draft) {
    return block(
      input,
      "block_closed_or_draft_pr",
      [
        `target PR must be open and non-draft, got state=${input.live_surface.state} draft=${String(input.live_surface.draft)}`,
      ],
      "restore the active PR surface before manifestation routing consumes it",
      sinkEvidence(input),
    );
  }

  if (candidate.base_head_sha !== input.live_surface.head_sha) {
    return block(
      input,
      "block_stale_head_authority",
      [`candidate base ${candidate.base_head_sha} is not live sink head ${input.live_surface.head_sha}`],
      "rebase the candidate to the live sink head and quarantine prompt, PR-body, memory, or repaired-head authorities",
      sinkEvidence(input),
    );
  }

  if (
    (candidate.operation === "review_request" || candidate.operation === "merge_command") &&
    (input.live_surface.blocker_label_present || input.live_surface.blocker_issue_open)
  ) {
    return block(
      input,
      "block_unresolved_blocker_surface",
      ["review or merge cannot consume a sink while blocker label or blocker issue is still open"],
      "retire the blocker surface on the live sink before review or merge routing",
      sinkEvidence(input),
    );
  }

  if (candidate.operation === "external_platform_embodiment") {
    const blockers = embodimentBlockers(candidate);
    if (blockers.length > 0) {
      return block(
        input,
        "block_stale_head_authority",
        blockers,
        "complete the behavior, routing, and proof evidence before moving the sink branch",
        sinkEvidence(input),
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_sink_bound_embodiment",
      decisive_evidence: [
        ...sinkEvidence(input),
        ...candidate.changed_files.filter(executablePlatformPath),
        ...candidate.executable_artifacts,
        ...candidate.routing_artifacts,
        ...candidate.proof_artifacts,
      ],
      blockers: [],
      next_route: "write the embodiment to the active sink branch, then require status for the moved sink head",
    };
  }

  if (candidate.operation === "fresh_status_readback") {
    return {
      ...base(input),
      ok: true,
      action: "admit_sink_bound_status_readback",
      decisive_evidence: sinkEvidence(input),
      blockers: [],
      next_route: "read status only from the live sink head, then choose a non-repeated embodiment or exact blocker",
    };
  }

  if (candidate.operation === "review_request") {
    return {
      ...base(input),
      ok: true,
      action: "admit_sink_bound_review_request",
      decisive_evidence: sinkEvidence(input),
      blockers: [],
      next_route: "request review only while the sink head remains unchanged and unblocked",
    };
  }

  if (candidate.operation === "merge_command") {
    return {
      ...base(input),
      ok: true,
      action: "admit_sink_bound_merge_command",
      decisive_evidence: sinkEvidence(input),
      blockers: [],
      next_route: "merge only while status, mergeability, review, and sink surfaces remain live-head bound",
    };
  }

  const blocker = candidate.blocker?.trim();
  if (!blocker) {
    return block(
      input,
      "block_missing_exact_blocker",
      ["sink-bound exact blocker operation has no blocker text"],
      "name one exact external blocker bound to the active manifestation sink",
      sinkEvidence(input),
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "emit_sink_bound_external_blocker",
    decisive_evidence: [...sinkEvidence(input), blocker],
    blockers: [blocker],
    next_route: "remove the named sink-bound blocker before claiming another manifestation move",
  };
}
