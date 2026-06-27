export type PostMergeContinuationAuthorityAction =
  | "admit_successor_pr_continuation"
  | "admit_successor_branch_embodiment"
  | "seal_merged_sink_receipt"
  | "emit_exact_post_merge_blocker"
  | "block_consumed_pr_sink"
  | "block_duplicate_or_metadata_only";

export type PostMergeContinuationCandidateKind =
  | "successor_pr"
  | "successor_branch"
  | "merge_receipt"
  | "exact_blocker"
  | "consumed_pr"
  | "metadata_only";

export interface ObservedMergedSink {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  state: "open" | "closed";
  merged: boolean;
  merge_commit_sha: string | null;
}

export interface PostMergeContinuationCandidate {
  candidate_id: string;
  kind: PostMergeContinuationCandidateKind;
  repository_full_name: string;
  branch: string;
  head_sha: string;
  pr_number?: number;
  pr_state?: "open" | "closed";
  executable_delta_files: string[];
  routing_artifacts: string[];
  blocker?: string;
}

export interface PostMergeContinuationAuthorityInput {
  authority_id: string;
  spent_authority_ids: string[];
  consumed_sink: ObservedMergedSink;
  candidates: PostMergeContinuationCandidate[];
}

export interface RejectedPostMergeContinuationCandidate {
  candidate_id: string;
  reasons: string[];
}

export interface SelectedPostMergeContinuationCandidate {
  candidate_id: string;
  kind: Extract<PostMergeContinuationCandidateKind, "successor_pr" | "successor_branch" | "merge_receipt" | "exact_blocker">;
  repository_full_name: string;
  branch: string;
  head_sha: string;
  pr_number: number | null;
  decisive_evidence: string[];
}

export interface PostMergeContinuationAuthorityVerdict {
  ok: boolean;
  action: PostMergeContinuationAuthorityAction;
  authority_id: string | null;
  consumed_pr_number: number;
  consumed_branch: string;
  merge_commit_sha: string | null;
  selected: SelectedPostMergeContinuationCandidate | null;
  rejected: RejectedPostMergeContinuationCandidate[];
  blockers: string[];
  next_route: string;
}

function executableDeltas(candidate: PostMergeContinuationCandidate): string[] {
  return [...new Set(candidate.executable_delta_files)]
    .map((path) => path.trim())
    .filter((path) => path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path))
    .sort((left, right) => left.localeCompare(right));
}

function routingArtifacts(candidate: PostMergeContinuationCandidate): string[] {
  return [...new Set(candidate.routing_artifacts.map((artifact) => artifact.trim()).filter(Boolean))];
}

function evidence(candidate: PostMergeContinuationCandidate): string[] {
  return [
    `candidate ${candidate.candidate_id || "<missing>"}`,
    `kind ${candidate.kind}`,
    `repository ${candidate.repository_full_name}`,
    `branch ${candidate.branch}`,
    `head ${candidate.head_sha}`,
    ...(candidate.pr_number ? [`PR #${candidate.pr_number}`] : []),
    ...executableDeltas(candidate).map((path) => `executable delta ${path}`),
    ...routingArtifacts(candidate),
    ...(candidate.blocker?.trim() ? [candidate.blocker.trim()] : []),
  ];
}

function rejectionReasons(
  input: PostMergeContinuationAuthorityInput,
  candidate: PostMergeContinuationCandidate,
): string[] {
  const reasons: string[] = [];
  const consumed = input.consumed_sink;
  const candidateId = candidate.candidate_id.trim();

  if (!candidateId) reasons.push("post-merge continuation candidate has no id");
  if (!candidate.repository_full_name.trim()) reasons.push("post-merge continuation candidate has no repository");
  if (!candidate.branch.trim()) reasons.push("post-merge continuation candidate has no branch");
  if (!candidate.head_sha.trim()) reasons.push("post-merge continuation candidate has no head sha");

  if (candidate.kind === "consumed_pr") {
    reasons.push(`PR #${consumed.pr_number} is already merged and cannot remain the active continuation sink`);
  }

  if (candidate.kind === "metadata_only") {
    reasons.push("metadata rereads and status comments are non-progress after merge completion");
  }

  if (candidate.branch === consumed.branch && candidate.head_sha === consumed.head_sha && candidate.kind !== "merge_receipt") {
    reasons.push("candidate reuses the consumed merged branch head without a successor surface");
  }

  if (candidate.kind === "successor_pr") {
    if (!candidate.pr_number) reasons.push("successor PR candidate has no PR number");
    if (candidate.pr_state !== "open") reasons.push("successor PR candidate is not open");
    if (executableDeltas(candidate).length === 0) reasons.push("successor PR candidate has no executable platform delta");
    if (routingArtifacts(candidate).length === 0) reasons.push("successor PR candidate has no routing artifact");
  }

  if (candidate.kind === "successor_branch") {
    if (candidate.branch === consumed.branch) reasons.push("successor branch must differ from the consumed merged branch");
    if (executableDeltas(candidate).length === 0) reasons.push("successor branch candidate has no executable platform delta");
    if (routingArtifacts(candidate).length === 0) reasons.push("successor branch candidate has no routing artifact");
  }

  if (candidate.kind === "merge_receipt") {
    if (!consumed.merged || consumed.state !== "closed") reasons.push("merge receipt requires the consumed sink to be closed and merged");
    if (!consumed.merge_commit_sha) reasons.push("merge receipt requires a merge commit sha");
  }

  if (candidate.kind === "exact_blocker" && !candidate.blocker?.trim()) {
    reasons.push("exact blocker candidate has no blocker text");
  }

  return reasons;
}

function priority(candidate: SelectedPostMergeContinuationCandidate): number {
  switch (candidate.kind) {
    case "successor_pr":
      return 4;
    case "successor_branch":
      return 3;
    case "merge_receipt":
      return 2;
    case "exact_blocker":
      return 1;
  }
}

function actionFor(kind: SelectedPostMergeContinuationCandidate["kind"]): PostMergeContinuationAuthorityAction {
  if (kind === "successor_pr") return "admit_successor_pr_continuation";
  if (kind === "successor_branch") return "admit_successor_branch_embodiment";
  if (kind === "merge_receipt") return "seal_merged_sink_receipt";
  return "emit_exact_post_merge_blocker";
}

function nextRouteFor(kind: SelectedPostMergeContinuationCandidate["kind"]): string {
  if (kind === "successor_pr") return "continue on the open successor PR and stop using the consumed merged PR as progress surface";
  if (kind === "successor_branch") return "open a successor PR before claiming PR-surface progress for the successor branch";
  if (kind === "merge_receipt") return "seal the merged sink and require a successor sink for any further embodiment";
  return "remove the exact post-merge blocker before selecting another continuation surface";
}

export function routePostMergeContinuationAuthority(
  input: PostMergeContinuationAuthorityInput,
): PostMergeContinuationAuthorityVerdict {
  const authorityId = input.authority_id.trim();
  const consumed = input.consumed_sink;

  if (!authorityId || input.spent_authority_ids.includes(authorityId)) {
    return {
      ok: false,
      action: "block_duplicate_or_metadata_only",
      authority_id: authorityId || null,
      consumed_pr_number: consumed.pr_number,
      consumed_branch: consumed.branch,
      merge_commit_sha: consumed.merge_commit_sha,
      selected: null,
      rejected: [],
      blockers: [authorityId ? `post-merge continuation authority already spent: ${authorityId}` : "post-merge continuation authority has no id"],
      next_route: "create a fresh authority id before another post-merge continuation decision",
    };
  }

  if (consumed.state !== "closed" || !consumed.merged || !consumed.merge_commit_sha) {
    return {
      ok: false,
      action: "emit_exact_post_merge_blocker",
      authority_id: authorityId,
      consumed_pr_number: consumed.pr_number,
      consumed_branch: consumed.branch,
      merge_commit_sha: consumed.merge_commit_sha,
      selected: null,
      rejected: [],
      blockers: [`PR #${consumed.pr_number} is not a closed merged sink with a merge commit`],
      next_route: "obtain a closed merged sink receipt before post-merge successor routing",
    };
  }

  const rejected: RejectedPostMergeContinuationCandidate[] = [];
  const selectable: SelectedPostMergeContinuationCandidate[] = [];

  for (const candidate of input.candidates) {
    const reasons = rejectionReasons(input, candidate);
    if (reasons.length > 0) {
      rejected.push({ candidate_id: candidate.candidate_id || "<missing>", reasons });
      continue;
    }

    if (
      candidate.kind === "successor_pr" ||
      candidate.kind === "successor_branch" ||
      candidate.kind === "merge_receipt" ||
      candidate.kind === "exact_blocker"
    ) {
      selectable.push({
        candidate_id: candidate.candidate_id,
        kind: candidate.kind,
        repository_full_name: candidate.repository_full_name,
        branch: candidate.branch,
        head_sha: candidate.head_sha,
        pr_number: candidate.pr_number ?? null,
        decisive_evidence: evidence(candidate),
      });
    }
  }

  selectable.sort((left, right) => priority(right) - priority(left));
  const selected = selectable[0] ?? null;

  if (!selected) {
    return {
      ok: false,
      action: "block_consumed_pr_sink",
      authority_id: authorityId,
      consumed_pr_number: consumed.pr_number,
      consumed_branch: consumed.branch,
      merge_commit_sha: consumed.merge_commit_sha,
      selected: null,
      rejected,
      blockers: ["closed merged PR sink has no admissible successor surface"],
      next_route: "create an open successor PR, a distinct successor branch with executable deltas, a merge receipt, or one exact blocker",
    };
  }

  return {
    ok: selected.kind !== "exact_blocker",
    action: actionFor(selected.kind),
    authority_id: authorityId,
    consumed_pr_number: consumed.pr_number,
    consumed_branch: consumed.branch,
    merge_commit_sha: consumed.merge_commit_sha,
    selected,
    rejected,
    blockers: selected.kind === "exact_blocker" ? selected.decisive_evidence : [],
    next_route: nextRouteFor(selected.kind),
  };
}
