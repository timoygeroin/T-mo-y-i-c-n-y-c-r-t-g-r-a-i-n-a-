export type RunnerSchedulerStatusSurface =
  | "passing"
  | "passing_with_warnings"
  | "head_moved_since_status"
  | "pending"
  | "failing"
  | "unknown";

export type RunnerSchedulerCapabilityAxis =
  | "runtime_execution"
  | "external_write"
  | "proof_surface"
  | "source_routing"
  | "status_readback";

export type RunnerSchedulerAction =
  | "schedule_next_embodiment_runner"
  | "block_status_surface"
  | "block_no_runnable_candidate";

export interface CompletedProgressReceipt {
  receipt_id: string;
  artifact_class: string;
  head_sha: string;
}

export interface EmbodimentRunnerCandidate {
  candidate_id: string;
  branch: string;
  base_head_sha: string;
  move_class: string;
  artifact_class: string;
  capability_axis: RunnerSchedulerCapabilityAxis;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  required_receipt_ids: string[];
  blocked_by_receipt_ids: string[];
  priority_weight: number;
  estimated_runtime_ms: number;
}

export interface EmbodimentRunnerSchedulerInput {
  active_branch: string;
  live_head_sha: string;
  status_surface: RunnerSchedulerStatusSurface;
  completed_receipts: CompletedProgressReceipt[];
  spent_artifact_classes: string[];
  prohibited_move_classes: string[];
  candidates: EmbodimentRunnerCandidate[];
}

export interface RejectedEmbodimentRunnerCandidate {
  candidate_id: string;
  blockers: string[];
}

export interface EmbodimentRunnerTicket {
  ticket_id: string;
  candidate_id: string;
  artifact_class: string;
  capability_axis: RunnerSchedulerCapabilityAxis;
  branch: string;
  base_head_sha: string;
  required_receipt_ids: string[];
  next_status_expected: string;
}

export interface EmbodimentRunnerSchedulerVerdict {
  ok: boolean;
  action: RunnerSchedulerAction;
  branch: string;
  head_sha: string;
  ticket: EmbodimentRunnerTicket | null;
  rejected: RejectedEmbodimentRunnerCandidate[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const CAPABILITY_PRIORITY: Record<RunnerSchedulerCapabilityAxis, number> = {
  runtime_execution: 5,
  external_write: 4,
  proof_surface: 3,
  source_routing: 2,
  status_readback: 1,
};

const NON_PROGRESS_MOVES = new Set([
  "fresh_status_readback",
  "duplicate_ci_summary",
  "metadata_reread",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "old_repaired_head_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function completedReceiptIds(input: EmbodimentRunnerSchedulerInput): Set<string> {
  return new Set(input.completed_receipts.map((receipt) => receipt.receipt_id));
}

function completedArtifactClasses(input: EmbodimentRunnerSchedulerInput): Set<string> {
  return new Set([
    ...input.spent_artifact_classes,
    ...input.completed_receipts.map((receipt) => receipt.artifact_class),
  ]);
}

function candidateBlockers(input: EmbodimentRunnerSchedulerInput, candidate: EmbodimentRunnerCandidate): string[] {
  const blockers: string[] = [];
  const receiptIds = completedReceiptIds(input);
  const artifactClasses = completedArtifactClasses(input);

  if (!candidate.candidate_id.trim()) blockers.push("candidate has no id");
  if (candidate.branch !== input.active_branch) {
    blockers.push(`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`);
  }
  if (candidate.base_head_sha !== input.live_head_sha) {
    blockers.push(`candidate base ${candidate.base_head_sha} does not match live head ${input.live_head_sha}`);
  }
  if (NON_PROGRESS_MOVES.has(candidate.move_class) || input.prohibited_move_classes.includes(candidate.move_class)) {
    blockers.push(`candidate move class is not executable embodiment progress: ${candidate.move_class}`);
  }
  if (!candidate.artifact_class.trim()) blockers.push("candidate has no artifact class");
  if (artifactClasses.has(candidate.artifact_class)) {
    blockers.push(`candidate artifact class is already spent: ${candidate.artifact_class}`);
  }
  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("candidate changes no executable platform file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("candidate has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("candidate has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("candidate has no proof artifact evidence");
  if (candidate.estimated_runtime_ms < 0) blockers.push("candidate estimated runtime cannot be negative");

  for (const required of candidate.required_receipt_ids) {
    if (!receiptIds.has(required)) blockers.push(`required receipt is missing: ${required}`);
  }

  for (const blockedBy of candidate.blocked_by_receipt_ids) {
    if (receiptIds.has(blockedBy)) blockers.push(`candidate is blocked by completed receipt: ${blockedBy}`);
  }

  return blockers;
}

function ticketFor(input: EmbodimentRunnerSchedulerInput, candidate: EmbodimentRunnerCandidate): EmbodimentRunnerTicket {
  return {
    ticket_id: `${candidate.candidate_id}:${input.live_head_sha}`,
    candidate_id: candidate.candidate_id,
    artifact_class: candidate.artifact_class,
    capability_axis: candidate.capability_axis,
    branch: input.active_branch,
    base_head_sha: input.live_head_sha,
    required_receipt_ids: candidate.required_receipt_ids,
    next_status_expected: "resulting_head_after_ticket_execution",
  };
}

function evidenceFor(input: EmbodimentRunnerSchedulerInput, candidate: EmbodimentRunnerCandidate): string[] {
  return [
    `live head ${input.live_head_sha}`,
    `status surface ${input.status_surface}`,
    candidate.candidate_id,
    candidate.artifact_class,
    candidate.capability_axis,
    ...candidate.changed_files.filter(executablePlatformPath),
    ...candidate.executable_artifacts,
    ...candidate.routing_artifacts,
    ...candidate.proof_artifacts,
    ...candidate.required_receipt_ids.map((receipt) => `requires ${receipt}`),
  ];
}

export function scheduleEmbodimentRunner(
  input: EmbodimentRunnerSchedulerInput,
): EmbodimentRunnerSchedulerVerdict {
  if (input.status_surface === "failing") {
    return {
      ok: false,
      action: "block_status_surface",
      branch: input.active_branch,
      head_sha: input.live_head_sha,
      ticket: null,
      rejected: [],
      decisive_evidence: [],
      blockers: [`live head ${input.live_head_sha} has failing status surface`],
      next_route: "repair the live-head failure before scheduling another embodiment runner",
    };
  }

  if (input.status_surface === "pending") {
    return {
      ok: false,
      action: "block_status_surface",
      branch: input.active_branch,
      head_sha: input.live_head_sha,
      ticket: null,
      rejected: [],
      decisive_evidence: [],
      blockers: [`live head ${input.live_head_sha} status surface is pending`],
      next_route: "wait for or read the live-head status surface before scheduling the runner",
    };
  }

  const rejected: RejectedEmbodimentRunnerCandidate[] = [];
  const runnable: EmbodimentRunnerCandidate[] = [];

  for (const candidate of input.candidates) {
    const blockers = candidateBlockers(input, candidate);
    if (blockers.length > 0) {
      rejected.push({ candidate_id: candidate.candidate_id || "<missing>", blockers });
      continue;
    }
    runnable.push(candidate);
  }

  runnable.sort((left, right) => {
    const capabilityDelta = CAPABILITY_PRIORITY[right.capability_axis] - CAPABILITY_PRIORITY[left.capability_axis];
    if (capabilityDelta !== 0) return capabilityDelta;

    const priorityDelta = right.priority_weight - left.priority_weight;
    if (priorityDelta !== 0) return priorityDelta;

    return left.estimated_runtime_ms - right.estimated_runtime_ms;
  });

  const selected = runnable[0];
  if (!selected) {
    return {
      ok: false,
      action: "block_no_runnable_candidate",
      branch: input.active_branch,
      head_sha: input.live_head_sha,
      ticket: null,
      rejected,
      decisive_evidence: [],
      blockers: ["no runnable external embodiment candidate survived scheduling"],
      next_route: "supply an unspent executable candidate or emit one exact external blocker",
    };
  }

  return {
    ok: true,
    action: "schedule_next_embodiment_runner",
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    ticket: ticketFor(input, selected),
    rejected,
    decisive_evidence: evidenceFor(input, selected),
    blockers: [],
    next_route: "execute the scheduled runner ticket, then bind the next status readback to the resulting head",
  };
}
