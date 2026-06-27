export type PostMergeSuccessorSinkKind =
  | "new_pull_request"
  | "successor_branch"
  | "merge_receipt_only"
  | "reuse_merged_pr"
  | "status_comment"
  | "exact_external_blocker";

export type PostMergeSuccessorSinkAction =
  | "select_new_pull_request_sink"
  | "select_successor_branch_sink"
  | "seal_merge_receipt_only"
  | "select_exact_external_blocker"
  | "block_no_successor_sink";

export interface PostMergeSuccessorCandidate {
  candidate_id: string;
  kind: PostMergeSuccessorSinkKind;
  repository_full_name: string;
  branch: string;
  head_sha: string;
  pr_number?: number;
  pr_state?: "open" | "closed";
  executable_delta_files: string[];
  routing_artifacts: string[];
  blocker?: string;
}

export interface PostMergeSuccessorSinkSelectorInput {
  merged_pr_number: number;
  merged_branch: string;
  merged_head_sha: string;
  merge_commit_sha: string;
  spent_candidate_ids: string[];
  candidates: PostMergeSuccessorCandidate[];
}

export interface RejectedPostMergeSuccessorCandidate {
  candidate_id: string;
  reasons: string[];
}

export interface SelectedPostMergeSuccessorSink {
  candidate_id: string;
  kind: Extract<PostMergeSuccessorSinkKind, "new_pull_request" | "successor_branch" | "merge_receipt_only" | "exact_external_blocker">;
  repository_full_name: string;
  branch: string;
  head_sha: string;
  pr_number: number | null;
  decisive_evidence: string[];
}

export interface PostMergeSuccessorSinkSelectorVerdict {
  ok: boolean;
  action: PostMergeSuccessorSinkAction;
  merged_pr_number: number;
  merge_commit_sha: string;
  selected: SelectedPostMergeSuccessorSink | null;
  rejected: RejectedPostMergeSuccessorCandidate[];
  blockers: string[];
  next_route: string;
}

function executablePlatformDeltas(candidate: PostMergeSuccessorCandidate): string[] {
  return [...new Set(candidate.executable_delta_files)]
    .map((path) => path.trim())
    .filter((path) => path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path))
    .sort((left, right) => left.localeCompare(right));
}

function candidateEvidence(candidate: PostMergeSuccessorCandidate): string[] {
  return [
    `candidate ${candidate.candidate_id}`,
    `kind ${candidate.kind}`,
    `repository ${candidate.repository_full_name}`,
    `branch ${candidate.branch}`,
    `head ${candidate.head_sha}`,
    ...(candidate.pr_number ? [`PR #${candidate.pr_number}`] : []),
    ...executablePlatformDeltas(candidate).map((path) => `executable delta ${path}`),
    ...candidate.routing_artifacts,
    ...(candidate.blocker ? [candidate.blocker] : []),
  ];
}

function rejectionReasons(
  input: PostMergeSuccessorSinkSelectorInput,
  candidate: PostMergeSuccessorCandidate,
): string[] {
  const reasons: string[] = [];
  const candidateId = candidate.candidate_id.trim();

  if (!candidateId) reasons.push("successor candidate has no id");
  if (input.spent_candidate_ids.includes(candidateId)) reasons.push(`successor candidate already spent: ${candidateId}`);
  if (!input.merge_commit_sha.trim()) reasons.push("merged PR has no merge commit SHA");

  if (candidate.kind === "reuse_merged_pr") {
    reasons.push(`PR #${input.merged_pr_number} is merged and cannot be reused as the active continuation sink`);
  }

  if (candidate.kind === "status_comment") {
    reasons.push("status comments on a merged PR are non-progress after merge completion");
  }

  if (candidate.branch === input.merged_branch && candidate.head_sha === input.merged_head_sha) {
    reasons.push("candidate reuses the merged PR branch head without a successor surface");
  }

  if (candidate.kind === "new_pull_request") {
    if (!candidate.pr_number) reasons.push("new pull request sink has no PR number");
    if (candidate.pr_state !== "open") reasons.push("new pull request sink is not open");
    if (executablePlatformDeltas(candidate).length === 0) reasons.push("new pull request sink has no executable platform delta");
    if (candidate.routing_artifacts.length === 0) reasons.push("new pull request sink has no routing artifact");
  }

  if (candidate.kind === "successor_branch") {
    if (candidate.branch === input.merged_branch) reasons.push("successor branch must not be the consumed merged PR branch");
    if (executablePlatformDeltas(candidate).length === 0) reasons.push("successor branch has no executable platform delta");
    if (candidate.routing_artifacts.length === 0) reasons.push("successor branch has no routing artifact");
  }

  if (candidate.kind === "merge_receipt_only") {
    if (candidate.repository_full_name.length === 0) reasons.push("merge receipt sink has no repository");
  }

  if (candidate.kind === "exact_external_blocker" && !candidate.blocker?.trim()) {
    reasons.push("exact external blocker candidate has no blocker text");
  }

  return reasons;
}

function actionFor(kind: SelectedPostMergeSuccessorSink["kind"]): PostMergeSuccessorSinkAction {
  if (kind === "new_pull_request") return "select_new_pull_request_sink";
  if (kind === "successor_branch") return "select_successor_branch_sink";
  if (kind === "merge_receipt_only") return "seal_merge_receipt_only";
  return "select_exact_external_blocker";
}

function priority(kind: SelectedPostMergeSuccessorSink["kind"]): number {
  switch (kind) {
    case "new_pull_request":
      return 4;
    case "successor_branch":
      return 3;
    case "merge_receipt_only":
      return 2;
    case "exact_external_blocker":
      return 1;
  }
}

export function selectPostMergeSuccessorSink(
  input: PostMergeSuccessorSinkSelectorInput,
): PostMergeSuccessorSinkSelectorVerdict {
  const rejected: RejectedPostMergeSuccessorCandidate[] = [];
  const selectedCandidates: SelectedPostMergeSuccessorSink[] = [];

  for (const candidate of input.candidates) {
    const reasons = rejectionReasons(input, candidate);
    if (reasons.length > 0) {
      rejected.push({ candidate_id: candidate.candidate_id || "<missing>", reasons });
      continue;
    }

    if (
      candidate.kind === "new_pull_request" ||
      candidate.kind === "successor_branch" ||
      candidate.kind === "merge_receipt_only" ||
      candidate.kind === "exact_external_blocker"
    ) {
      selectedCandidates.push({
        candidate_id: candidate.candidate_id,
        kind: candidate.kind,
        repository_full_name: candidate.repository_full_name,
        branch: candidate.branch,
        head_sha: candidate.head_sha,
        pr_number: candidate.pr_number ?? null,
        decisive_evidence: candidateEvidence(candidate),
      });
    }
  }

  selectedCandidates.sort((left, right) => priority(right.kind) - priority(left.kind));
  const selected = selectedCandidates[0] ?? null;

  if (!selected) {
    return {
      ok: false,
      action: "block_no_successor_sink",
      merged_pr_number: input.merged_pr_number,
      merge_commit_sha: input.merge_commit_sha,
      selected: null,
      rejected,
      blockers: ["no post-merge successor sink survived selection"],
      next_route: "create an open successor PR, a distinct successor branch with executable deltas, or emit one exact external blocker",
    };
  }

  return {
    ok: selected.kind !== "exact_external_blocker",
    action: actionFor(selected.kind),
    merged_pr_number: input.merged_pr_number,
    merge_commit_sha: input.merge_commit_sha,
    selected,
    rejected,
    blockers: selected.kind === "exact_external_blocker" ? selected.decisive_evidence : [],
    next_route:
      selected.kind === "new_pull_request"
        ? "continue finalization on the open successor PR, not the consumed merged PR"
        : selected.kind === "successor_branch"
          ? "open a successor PR for the selected branch before claiming PR-surface progress"
          : selected.kind === "merge_receipt_only"
            ? "seal the merge receipt and stop treating the merged PR as an active embodiment sink"
            : "remove the exact external blocker before selecting another post-merge sink",
  };
}

export * from "./post-merge-sink-closure.js";
