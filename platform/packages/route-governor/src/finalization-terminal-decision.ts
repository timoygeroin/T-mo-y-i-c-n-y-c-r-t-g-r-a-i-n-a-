export type FinalizationTerminalStatusVerdict =
  | "passing"
  | "passing_with_warnings"
  | "pending"
  | "failing"
  | "no_status_surface";

export type FinalizationTerminalCandidateClass =
  | "merge_handoff"
  | "review_handoff"
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_review_request"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "metadata_reread"
  | "warning_maintenance"
  | "reclose_resolved_blocker";

export type FinalizationTerminalDecisionAction =
  | "route_to_merge_handoff"
  | "route_to_review_handoff"
  | "route_to_external_embodiment"
  | "route_to_fresh_status_readback"
  | "emit_exact_external_blocker"
  | "block_terminal_decision";

export interface FinalizationTerminalStatusSurface {
  surface_id: string;
  head_sha: string;
  verdict: FinalizationTerminalStatusVerdict;
  decisive_successes: string[];
  blockers: string[];
  warnings: string[];
}

export interface FinalizationTerminalDecisionCandidate {
  candidate_id: string;
  candidate_class: FinalizationTerminalCandidateClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  approvals?: string[];
  requested_reviewers?: string[];
  blocker?: string;
}

export interface FinalizationTerminalDecisionInput {
  repository_full_name: string;
  pr_number: number;
  active_branch: string;
  live_head_sha: string;
  last_status_readback_head_sha: string;
  repaired_head_sha: string;
  draft: boolean;
  mergeable: boolean;
  required_approval_count: number;
  resolved_blocker_ids: string[];
  prohibited_candidate_classes: FinalizationTerminalCandidateClass[];
  status_surface?: FinalizationTerminalStatusSurface;
  candidates: FinalizationTerminalDecisionCandidate[];
}

export interface FinalizationTerminalCandidateRejection {
  candidate_id: string;
  reasons: string[];
}

export interface FinalizationTerminalDecisionVerdict {
  ok: boolean;
  action: FinalizationTerminalDecisionAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  selected_candidate_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  rejected: FinalizationTerminalCandidateRejection[];
  quarantined_heads: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<FinalizationTerminalCandidateClass>([
  "duplicate_review_request",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "metadata_reread",
  "warning_maintenance",
  "reclose_resolved_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function readyStatus(surface?: FinalizationTerminalStatusSurface): boolean {
  return (
    !!surface &&
    (surface.verdict === "passing" || surface.verdict === "passing_with_warnings") &&
    surface.head_sha.length > 0 &&
    surface.decisive_successes.length > 0 &&
    surface.blockers.length === 0
  );
}

function base(input: FinalizationTerminalDecisionInput): Omit<
  FinalizationTerminalDecisionVerdict,
  "ok" | "action" | "selected_candidate_id" | "decisive_evidence" | "blockers" | "rejected" | "next_route"
> {
  const quarantined = new Set<string>();
  if (input.repaired_head_sha !== input.live_head_sha) quarantined.add(input.repaired_head_sha);
  if (input.last_status_readback_head_sha !== input.live_head_sha) quarantined.add(input.last_status_readback_head_sha);

  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    warnings: input.status_surface?.warnings ?? [],
    quarantined_heads: [...quarantined],
  };
}

function block(
  input: FinalizationTerminalDecisionInput,
  rejected: FinalizationTerminalCandidateRejection[],
  blockers: string[],
  nextRoute: string,
): FinalizationTerminalDecisionVerdict {
  return {
    ...base(input),
    ok: false,
    action: "block_terminal_decision",
    selected_candidate_id: null,
    decisive_evidence: [],
    blockers,
    rejected,
    next_route: nextRoute,
  };
}

function embodimentBlockers(candidate: FinalizationTerminalDecisionCandidate): string[] {
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (executableChanges.length === 0) blockers.push("terminal embodiment changes no executable platform file");
  if (behaviorChanges.length === 0) blockers.push("terminal embodiment has no behavior-bearing executable file");
  if (candidate.executable_artifacts.length === 0) blockers.push("terminal embodiment has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("terminal embodiment has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("terminal embodiment has no proof artifact evidence");

  return blockers;
}

function commonCandidateBlockers(
  input: FinalizationTerminalDecisionInput,
  candidate: FinalizationTerminalDecisionCandidate,
): string[] {
  const blockers: string[] = [];

  if (!candidate.candidate_id.trim()) blockers.push("terminal candidate has no candidate id");
  if (candidate.branch !== input.active_branch) {
    blockers.push(`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`);
  }
  if (candidate.base_head_sha !== input.live_head_sha) {
    blockers.push(`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`);
  }
  if (input.prohibited_candidate_classes.includes(candidate.candidate_class) || NON_PROGRESS_CLASSES.has(candidate.candidate_class)) {
    blockers.push(`terminal candidate class is non-progress: ${candidate.candidate_class}`);
  }

  return blockers;
}

function candidatePriority(candidateClass: FinalizationTerminalCandidateClass): number {
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

function candidateDecision(
  input: FinalizationTerminalDecisionInput,
  candidate: FinalizationTerminalDecisionCandidate,
): { action: FinalizationTerminalDecisionAction; evidence: string[]; blockers: string[]; next_route: string } {
  const blockers = commonCandidateBlockers(input, candidate);
  const status = input.status_surface;
  const statusReady = readyStatus(status) && status?.head_sha === input.live_head_sha;

  if (candidate.candidate_class === "fresh_status_readback") {
    if (input.live_head_sha === input.last_status_readback_head_sha) {
      blockers.push("fresh status readback is not fresh because live head equals last status readback head");
    }
  } else if (candidate.candidate_class !== "exact_external_blocker" && !statusReady) {
    blockers.push(
      status?.head_sha && status.head_sha !== input.live_head_sha
        ? `status surface ${status.surface_id} belongs to ${status.head_sha}, not ${input.live_head_sha}`
        : "terminal handoff requires passing live-head status evidence",
    );
  }

  if ((candidate.candidate_class === "merge_handoff" || candidate.candidate_class === "review_handoff") && input.draft) {
    blockers.push("PR is still draft");
  }

  if ((candidate.candidate_class === "merge_handoff" || candidate.candidate_class === "review_handoff") && !input.mergeable) {
    blockers.push("GitHub mergeability is not confirmed");
  }

  if (candidate.candidate_class === "merge_handoff") {
    const approvalCount = candidate.approvals?.length ?? 0;
    const required = Math.max(1, input.required_approval_count);
    if (approvalCount < required) blockers.push(`merge handoff requires ${required} approval(s); got ${approvalCount}`);
  }

  if (candidate.candidate_class === "review_handoff" && (candidate.requested_reviewers?.length ?? 0) === 0) {
    blockers.push("review handoff has no requested reviewer evidence");
  }

  if (candidate.candidate_class === "external_platform_embodiment") {
    blockers.push(...embodimentBlockers(candidate));
  }

  if (candidate.candidate_class === "exact_external_blocker" && !candidate.blocker?.trim()) {
    blockers.push("exact external blocker candidate has no blocker text");
  }

  if (blockers.length > 0) {
    return {
      action: "block_terminal_decision",
      evidence: [],
      blockers,
      next_route: "reject this terminal candidate and choose the highest surviving non-repeated route",
    };
  }

  const statusEvidence = status ? [`status surface ${status.surface_id}`, ...status.decisive_successes] : [];
  const commonEvidence = [
    `live head ${input.live_head_sha}`,
    ...input.resolved_blocker_ids.map((id) => `resolved blocker ${id}`),
    ...statusEvidence,
  ];

  switch (candidate.candidate_class) {
    case "merge_handoff":
      return {
        action: "route_to_merge_handoff",
        evidence: [...commonEvidence, ...(candidate.approvals ?? []).map((reviewer) => `approval ${reviewer}`)],
        blockers: [],
        next_route: "compile the guarded merge command only while the PR head, status, mergeability, and approvals remain current",
      };
    case "review_handoff":
      return {
        action: "route_to_review_handoff",
        evidence: [...commonEvidence, ...(candidate.requested_reviewers ?? []).map((reviewer) => `review target ${reviewer}`)],
        blockers: [],
        next_route: "request final review on the live head; do not add duplicate summaries or labels",
      };
    case "external_platform_embodiment":
      return {
        action: "route_to_external_embodiment",
        evidence: [
          ...commonEvidence,
          ...candidate.changed_files.filter(executablePlatformPath),
          ...candidate.executable_artifacts,
          ...candidate.routing_artifacts,
          ...candidate.proof_artifacts,
        ],
        blockers: [],
        next_route: "commit the executable embodiment, then bind any status claim to the moved head only",
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
        action: "block_terminal_decision",
        evidence: [],
        blockers: [`terminal candidate class is not admissible: ${candidate.candidate_class}`],
        next_route: "choose merge, review, embodiment, fresh status, or exact blocker",
      };
  }
}

export function compileFinalizationTerminalDecision(
  input: FinalizationTerminalDecisionInput,
): FinalizationTerminalDecisionVerdict {
  const rejected: FinalizationTerminalCandidateRejection[] = [];
  const selectable = input.candidates
    .map((candidate) => ({ candidate, decision: candidateDecision(input, candidate) }))
    .filter(({ candidate, decision }) => {
      if (decision.action === "block_terminal_decision") {
        rejected.push({ candidate_id: candidate.candidate_id || "<unknown>", reasons: decision.blockers });
        return false;
      }
      return true;
    })
    .sort((left, right) => candidatePriority(right.candidate.candidate_class) - candidatePriority(left.candidate.candidate_class));

  const selected = selectable[0];
  if (!selected) {
    return block(
      input,
      rejected,
      ["no terminal finalization candidate survived"],
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
