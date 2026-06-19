export type HeadAuthoritySourceKind =
  | "live_pr_metadata"
  | "direct_status_surface"
  | "pr_body_summary"
  | "scheduled_prompt"
  | "user_instruction"
  | "memory_receipt"
  | "issue_state";

export type HeadAuthorityStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export type HeadAuthorityMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "current_failure_repair"
  | "exact_external_blocker"
  | "warning_maintenance"
  | "metadata_reread"
  | "duplicate_ci_summary";

export type HeadAuthorityQuorumAction =
  | "admit_live_head_embodiment"
  | "admit_live_status_readback"
  | "admit_live_failure_repair"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_missing_live_metadata"
  | "block_stale_candidate_base"
  | "block_non_progress_move"
  | "block_stale_failure_repair"
  | "block_stale_status_readback"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export interface HeadAuthoritySource {
  source_id: string;
  kind: HeadAuthoritySourceKind;
  branch: string;
  head_sha?: string;
  status_verdict?: HeadAuthorityStatusVerdict;
  mergeable?: boolean | null;
  evidence: string[];
}

export interface HeadAuthorityCandidate {
  move_class: HeadAuthorityMoveClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
  failure_signature?: string;
}

export interface HeadAuthorityQuorumInput {
  active_branch: string;
  live_head_sha: string;
  resolved_historical_heads: string[];
  sources: HeadAuthoritySource[];
  candidate: HeadAuthorityCandidate;
}

export interface HeadAuthorityQuorumVerdict {
  ok: boolean;
  action: HeadAuthorityQuorumAction;
  branch: string;
  head_sha: string;
  accepted_authority_ids: string[];
  quarantined_authority_ids: string[];
  historical_authority_ids: string[];
  summary_authority_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const SUMMARY_KINDS = new Set<HeadAuthoritySourceKind>([
  "pr_body_summary",
  "scheduled_prompt",
  "user_instruction",
  "memory_receipt",
  "issue_state",
]);

const DIRECT_AUTHORITY_KINDS = new Set<HeadAuthoritySourceKind>(["live_pr_metadata", "direct_status_surface"]);

const NON_PROGRESS_MOVES = new Set<HeadAuthorityMoveClass>([
  "warning_maintenance",
  "metadata_reread",
  "duplicate_ci_summary",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function behaviorPath(path: string): boolean {
  return executablePlatformPath(path) && !proofOnlyPath(path) && !path.endsWith("/package.json") && !path.endsWith("/index.ts");
}

function onLiveHead(input: HeadAuthorityQuorumInput, source: HeadAuthoritySource): boolean {
  return source.branch === input.active_branch && source.head_sha === input.live_head_sha;
}

function isHistorical(input: HeadAuthorityQuorumInput, source: HeadAuthoritySource): boolean {
  return Boolean(source.head_sha) && input.resolved_historical_heads.includes(source.head_sha ?? "");
}

function classify(input: HeadAuthorityQuorumInput): Pick<
  HeadAuthorityQuorumVerdict,
  "accepted_authority_ids" | "quarantined_authority_ids" | "historical_authority_ids" | "summary_authority_ids"
> {
  const accepted: string[] = [];
  const quarantined: string[] = [];
  const historical: string[] = [];
  const summary: string[] = [];

  for (const source of input.sources) {
    if (SUMMARY_KINDS.has(source.kind)) summary.push(source.source_id);
    if (onLiveHead(input, source) && DIRECT_AUTHORITY_KINDS.has(source.kind)) {
      accepted.push(source.source_id);
      continue;
    }
    if (isHistorical(input, source)) {
      historical.push(source.source_id);
      continue;
    }
    if (source.head_sha && source.head_sha !== input.live_head_sha) quarantined.push(source.source_id);
  }

  return {
    accepted_authority_ids: [...new Set(accepted)],
    quarantined_authority_ids: [...new Set(quarantined)],
    historical_authority_ids: [...new Set(historical)],
    summary_authority_ids: [...new Set(summary)],
  };
}

function base(input: HeadAuthorityQuorumInput): Pick<HeadAuthorityQuorumVerdict, "branch" | "head_sha"> {
  return { branch: input.active_branch, head_sha: input.live_head_sha };
}

function block(
  input: HeadAuthorityQuorumInput,
  action: Exclude<
    HeadAuthorityQuorumAction,
    | "admit_live_head_embodiment"
    | "admit_live_status_readback"
    | "admit_live_failure_repair"
    | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): HeadAuthorityQuorumVerdict {
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

function liveMetadata(input: HeadAuthorityQuorumInput): HeadAuthoritySource[] {
  return input.sources.filter((source) => source.kind === "live_pr_metadata" && onLiveHead(input, source));
}

function liveStatus(input: HeadAuthorityQuorumInput): HeadAuthoritySource[] {
  return input.sources.filter((source) => source.kind === "direct_status_surface" && onLiveHead(input, source));
}

function liveFailures(input: HeadAuthorityQuorumInput): HeadAuthoritySource[] {
  return liveStatus(input).filter((source) => source.status_verdict === "failing");
}

function staleFailureSummaries(input: HeadAuthorityQuorumInput): HeadAuthoritySource[] {
  return input.sources.filter(
    (source) =>
      SUMMARY_KINDS.has(source.kind) &&
      source.status_verdict === "failing" &&
      Boolean(source.head_sha) &&
      source.head_sha !== input.live_head_sha,
  );
}

function incompleteEmbodiment(candidate: HeadAuthorityCandidate): string[] {
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const blockers: string[] = [];

  if (executableChanges.length === 0) blockers.push("head-authority embodiment changes no executable platform file");
  if (!candidate.changed_files.some(behaviorPath)) blockers.push("head-authority embodiment has no behavior-bearing platform file");
  if (candidate.executable_artifacts.length === 0) blockers.push("head-authority embodiment has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("head-authority embodiment has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("head-authority embodiment has no proof artifact evidence");

  return blockers;
}

export function compileHeadAuthorityQuorum(input: HeadAuthorityQuorumInput): HeadAuthorityQuorumVerdict {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the candidate to the active manifestation branch before release",
    );
  }

  const metadata = liveMetadata(input);
  if (metadata.length === 0) {
    return block(
      input,
      "block_missing_live_metadata",
      [`no live PR metadata authority is bound to ${input.active_branch}@${input.live_head_sha}`],
      "read live PR metadata before trusting prompt, PR-body, memory, issue, or scheduled head claims",
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_candidate_base",
      [`candidate base ${candidate.base_head_sha} is not live PR head ${input.live_head_sha}`],
      "rebase the candidate to the live metadata head; preserve stale heads only as quarantined or historical authorities",
      metadata.flatMap((source) => [source.source_id, ...source.evidence]),
    );
  }

  if (NON_PROGRESS_MOVES.has(candidate.move_class)) {
    return block(
      input,
      "block_non_progress_move",
      [`head-authority quorum cannot be satisfied by ${candidate.move_class}`],
      "choose an executable embodiment, live status readback, live failure repair, or exact external blocker",
      [candidate.move_class],
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
          ? staleSummaries.map((source) => `stale failure summary cannot authorize repair: ${source.source_id}`)
          : ["failure repair has no direct live-head failing status surface"],
        "obtain a direct failing status surface for the live head before repairing",
        staleSummaries.flatMap((source) => [source.source_id, ...source.evidence]),
      );
    }

    if (!candidate.failure_signature?.trim()) {
      return block(
        input,
        "block_stale_failure_repair",
        ["failure repair candidate has no live-head failure signature"],
        "bind the repair to the concrete live-head failure signature before writing code",
        failures.flatMap((source) => [source.source_id, ...source.evidence]),
      );
    }

    return {
      ...base(input),
      ...classify(input),
      ok: true,
      action: "admit_live_failure_repair",
      decisive_evidence: [
        candidate.failure_signature,
        ...failures.flatMap((source) => [source.source_id, ...source.evidence]),
        ...candidate.changed_files.filter(executablePlatformPath),
        ...candidate.executable_artifacts,
        ...candidate.routing_artifacts,
        ...candidate.proof_artifacts,
      ],
      blockers: [],
      next_route: "repair the direct live-head failure, then require status readback for the moved head",
    };
  }

  if (candidate.move_class === "fresh_status_readback") {
    const status = liveStatus(input);
    if (status.length === 0) {
      return block(
        input,
        "block_stale_status_readback",
        ["fresh status readback has no direct live-head status authority in the quorum"],
        "do not replay prompt, PR-body, memory, issue, or scheduled summaries as fresh status readback",
        metadata.flatMap((source) => [source.source_id, ...source.evidence]),
      );
    }

    return {
      ...base(input),
      ...classify(input),
      ok: true,
      action: "admit_live_status_readback",
      decisive_evidence: status.flatMap((source) => [source.source_id, ...source.evidence]),
      blockers: [],
      next_route: "publish only the direct live-head status readback, then choose a non-repeated embodiment or exact blocker",
    };
  }

  if (candidate.move_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["exact-blocker candidate has no blocker text"],
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
      next_route: "remove the named live-head blocker before another finalization progress claim",
    };
  }

  const blockers = incompleteEmbodiment(candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "supply behavior-bearing executable, routing, and proof evidence before moving the branch",
      metadata.flatMap((source) => [source.source_id, ...source.evidence]),
    );
  }

  return {
    ...base(input),
    ...classify(input),
    ok: true,
    action: "admit_live_head_embodiment",
    decisive_evidence: [
      ...metadata.flatMap((source) => [source.source_id, ...source.evidence]),
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the live-head embodiment, then bind the next status readback to the moved head only",
  };
}
