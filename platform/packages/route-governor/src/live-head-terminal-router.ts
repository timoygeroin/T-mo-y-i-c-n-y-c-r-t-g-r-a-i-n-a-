export type LiveHeadTerminalStatusVerdict =
  | "passing"
  | "passing_with_warnings"
  | "pending"
  | "failing"
  | "no_status_surface";

export type LiveHeadTerminalCandidateClass =
  | "merge_handoff"
  | "review_handoff"
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "metadata_reread"
  | "reclose_resolved_blocker"
  | "warning_maintenance";

export type LiveHeadTerminalAction =
  | "route_to_merge_handoff"
  | "route_to_review_handoff"
  | "route_to_external_embodiment"
  | "route_to_fresh_status_readback"
  | "emit_exact_external_blocker"
  | "block_live_head_terminal_route";

export interface LiveHeadTerminalStatusSurface {
  surface_id: string;
  head_sha: string;
  verdict: LiveHeadTerminalStatusVerdict;
  decisive_successes: string[];
  blockers: string[];
  warnings: string[];
}

export interface LiveHeadTerminalCandidate {
  candidate_id: string;
  candidate_class: LiveHeadTerminalCandidateClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  requested_reviewers?: string[];
  approvals?: string[];
  blocker?: string;
}

export interface LiveHeadTerminalRouterInput {
  repository_full_name: string;
  pr_number: number;
  active_branch: string;
  live_head_sha: string;
  repaired_head_sha: string;
  last_status_readback_head_sha: string;
  draft: boolean;
  mergeable: boolean;
  required_approval_count: number;
  resolved_blocker_ids: string[];
  status_surface?: LiveHeadTerminalStatusSurface;
  candidates: LiveHeadTerminalCandidate[];
}

export interface LiveHeadTerminalCandidateRejection {
  candidate_id: string;
  reasons: string[];
}

export interface LiveHeadTerminalRouterVerdict {
  ok: boolean;
  action: LiveHeadTerminalAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  selected_candidate_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  rejected: LiveHeadTerminalCandidateRejection[];
  retired_head_shas: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<LiveHeadTerminalCandidateClass>([
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "metadata_reread",
  "reclose_resolved_blocker",
  "warning_maintenance",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorBearingPath(path: string): boolean {
  return executablePlatformPath(path) && !/(?:\.test|-proof)\.ts$/.test(path);
}

function present(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => value.trim()).filter(Boolean);
}

function readyStatus(surface: LiveHeadTerminalStatusSurface | undefined, liveHeadSha: string): boolean {
  return (
    !!surface &&
    surface.head_sha === liveHeadSha &&
    (surface.verdict === "passing" || surface.verdict === "passing_with_warnings") &&
    surface.decisive_successes.length > 0 &&
    surface.blockers.length === 0
  );
}

function retiredHeads(input: LiveHeadTerminalRouterInput): string[] {
  return [...new Set([input.repaired_head_sha, input.last_status_readback_head_sha].filter((head) => head !== input.live_head_sha))];
}

function base(input: LiveHeadTerminalRouterInput): Omit<
  LiveHeadTerminalRouterVerdict,
  "ok" | "action" | "selected_candidate_id" | "decisive_evidence" | "blockers" | "rejected" | "next_route"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    warnings: input.status_surface?.warnings ?? [],
    retired_head_shas: retiredHeads(input),
  };
}

function block(
  input: LiveHeadTerminalRouterInput,
  rejected: LiveHeadTerminalCandidateRejection[],
  blockers: string[],
  nextRoute: string,
): LiveHeadTerminalRouterVerdict {
  return {
    ...base(input),
    ok: false,
    action: "block_live_head_terminal_route",
    selected_candidate_id: null,
    decisive_evidence: [],
    blockers,
    rejected,
    next_route: nextRoute,
  };
}

function priority(candidateClass: LiveHeadTerminalCandidateClass): number {
  switch (candidateClass) {
    case "merge_handoff":
      return 50;
    case "review_handoff":
      return 40;
    case "external_platform_embodiment":
      return 30;
    case "fresh_status_readback":
      return 20;
    case "exact_external_blocker":
      return 10;
    default:
      return 0;
  }
}

function commonBlockers(input: LiveHeadTerminalRouterInput, candidate: LiveHeadTerminalCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.candidate_id.trim()) blockers.push("live-head terminal candidate has no candidate id");
  if (candidate.branch !== input.active_branch) {
    blockers.push(`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`);
  }
  if (candidate.base_head_sha !== input.live_head_sha) {
    blockers.push(
      candidate.base_head_sha === input.repaired_head_sha
        ? `candidate reuses retired repaired head ${input.repaired_head_sha}`
        : `candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`,
    );
  }
  if (NON_PROGRESS_CLASSES.has(candidate.candidate_class)) {
    blockers.push(`live-head terminal candidate class is non-progress: ${candidate.candidate_class}`);
  }

  return blockers;
}

function embodimentBlockers(candidate: LiveHeadTerminalCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.changed_files.some(behaviorBearingPath)) blockers.push("terminal embodiment has no behavior-bearing executable file");
  if (present(candidate.executable_artifacts).length === 0) blockers.push("terminal embodiment has no executable artifact evidence");
  if (present(candidate.routing_artifacts).length === 0) blockers.push("terminal embodiment has no future-routing artifact evidence");
  if (present(candidate.proof_artifacts).length === 0) blockers.push("terminal embodiment has no proof artifact evidence");

  return blockers;
}

function candidateDecision(
  input: LiveHeadTerminalRouterInput,
  candidate: LiveHeadTerminalCandidate,
): { action: LiveHeadTerminalAction; evidence: string[]; blockers: string[]; next_route: string } {
  const blockers = commonBlockers(input, candidate);
  const statusReady = readyStatus(input.status_surface, input.live_head_sha);
  const statusEvidence = input.status_surface
    ? [`status surface ${input.status_surface.surface_id}`, ...input.status_surface.decisive_successes]
    : [];
  const commonEvidence = [
    `live head ${input.live_head_sha}`,
    ...input.resolved_blocker_ids.map((id) => `resolved blocker ${id}`),
    ...statusEvidence,
  ];

  if (candidate.candidate_class === "fresh_status_readback") {
    if (input.live_head_sha === input.last_status_readback_head_sha) {
      blockers.push("fresh status readback is not fresh because live head equals last status readback head");
    }
  } else if (candidate.candidate_class !== "exact_external_blocker" && candidate.candidate_class !== "external_platform_embodiment") {
    if (!statusReady) {
      blockers.push(
        input.status_surface?.head_sha && input.status_surface.head_sha !== input.live_head_sha
          ? `status surface ${input.status_surface.surface_id} belongs to ${input.status_surface.head_sha}, not ${input.live_head_sha}`
          : "terminal handoff requires passing live-head status evidence",
      );
    }
  }

  if (candidate.candidate_class === "merge_handoff") {
    if (input.draft) blockers.push("PR is still draft");
    if (!input.mergeable) blockers.push("GitHub mergeability is not confirmed");
    const approvalCount = present(candidate.approvals).length;
    const required = Math.max(1, input.required_approval_count);
    if (approvalCount < required) blockers.push(`merge handoff requires ${required} approval(s); got ${approvalCount}`);
  }

  if (candidate.candidate_class === "review_handoff") {
    if (input.draft) blockers.push("PR is still draft");
    if (present(candidate.requested_reviewers).length === 0) blockers.push("review handoff has no requested reviewer evidence");
  }

  if (candidate.candidate_class === "external_platform_embodiment") {
    blockers.push(...embodimentBlockers(candidate));
  }

  if (candidate.candidate_class === "exact_external_blocker" && !candidate.blocker?.trim()) {
    blockers.push("exact external blocker candidate has no blocker text");
  }

  if (blockers.length > 0) {
    return {
      action: "block_live_head_terminal_route",
      evidence: [],
      blockers,
      next_route: "reject this terminal candidate and choose the highest surviving live-head route",
    };
  }

  switch (candidate.candidate_class) {
    case "merge_handoff":
      return {
        action: "route_to_merge_handoff",
        evidence: [...commonEvidence, ...present(candidate.approvals).map((reviewer) => `approval ${reviewer}`)],
        blockers: [],
        next_route: "compile the guarded merge command only while status, mergeability, approvals, and head remain current",
      };
    case "review_handoff":
      return {
        action: "route_to_review_handoff",
        evidence: [...commonEvidence, ...present(candidate.requested_reviewers).map((reviewer) => `review target ${reviewer}`)],
        blockers: [],
        next_route: "request final review on the live head without duplicate comments, labels, or summaries",
      };
    case "external_platform_embodiment":
      return {
        action: "route_to_external_embodiment",
        evidence: [
          ...commonEvidence,
          ...candidate.changed_files.filter(behaviorBearingPath),
          ...present(candidate.executable_artifacts),
          ...present(candidate.routing_artifacts),
          ...present(candidate.proof_artifacts),
        ],
        blockers: [],
        next_route: "commit the executable embodiment, then read only moved-head checks before any status claim",
      };
    case "fresh_status_readback":
      return {
        action: "route_to_fresh_status_readback",
        evidence: [`head moved from ${input.last_status_readback_head_sha} to ${input.live_head_sha}`],
        blockers: [],
        next_route: "read only current live-head checks before making a status claim",
      };
    case "exact_external_blocker":
      return {
        action: "emit_exact_external_blocker",
        evidence: [candidate.blocker?.trim() ?? "", `live head ${input.live_head_sha}`],
        blockers: [candidate.blocker?.trim() ?? ""],
        next_route: "remove the named external blocker before attempting another terminal route",
      };
    default:
      return {
        action: "block_live_head_terminal_route",
        evidence: [],
        blockers: [`terminal candidate class is not admissible: ${candidate.candidate_class}`],
        next_route: "choose merge, review, embodiment, fresh status, or exact blocker",
      };
  }
}

export function routeLiveHeadTerminal(input: LiveHeadTerminalRouterInput): LiveHeadTerminalRouterVerdict {
  const rejected: LiveHeadTerminalCandidateRejection[] = [];
  const selectable = input.candidates
    .map((candidate) => ({ candidate, decision: candidateDecision(input, candidate) }))
    .filter(({ candidate, decision }) => {
      if (decision.action === "block_live_head_terminal_route") {
        rejected.push({ candidate_id: candidate.candidate_id || "<unknown>", reasons: decision.blockers });
        return false;
      }
      return true;
    })
    .sort((left, right) => priority(right.candidate.candidate_class) - priority(left.candidate.candidate_class));

  const selected = selectable[0];
  if (!selected) {
    return block(
      input,
      rejected,
      ["no live-head terminal candidate survived"],
      "supply one live-head merge, review, embodiment, fresh-status, or exact-blocker candidate that is not a spent class",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: selected.decision.action,
    selected_candidate_id: selected.candidate.candidate_id,
    decisive_evidence: selected.decision.evidence,
    blockers: selected.decision.blockers,
    rejected,
    next_route: selected.decision.next_route,
  };
}
