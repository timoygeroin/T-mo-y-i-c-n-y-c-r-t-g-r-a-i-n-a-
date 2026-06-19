export type ScheduledWriteCollisionMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_ci_summary"
  | "metadata_reread"
  | "local_memory_guard"
  | "warning_maintenance";

export type ScheduledWriteCollisionAction =
  | "admit_scheduled_write"
  | "block_branch_mismatch"
  | "block_missing_intent"
  | "block_intent_collision"
  | "block_stale_observed_head"
  | "block_repaired_head_base"
  | "block_non_progress_move"
  | "block_repeated_write_class"
  | "block_incomplete_increment"
  | "block_status_claim_substitution";

export interface ScheduledWriteCollisionCandidate {
  intent_id: string;
  scheduler_invocation_id: string;
  move_class: ScheduledWriteCollisionMoveClass;
  write_class: string;
  branch: string;
  observed_head_sha: string;
  base_head_sha: string;
  changed_files: string[];
  behavior_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  status_claim_head_sha?: string;
}

export interface ScheduledWriteCollisionFenceInput {
  active_branch: string;
  live_head_sha: string;
  repaired_historical_heads: string[];
  open_intent_ids: string[];
  completed_intent_ids: string[];
  spent_write_classes: string[];
  non_progress_move_classes: ScheduledWriteCollisionMoveClass[];
  candidate: ScheduledWriteCollisionCandidate;
}

export interface ScheduledWriteCollisionFenceVerdict {
  ok: boolean;
  action: ScheduledWriteCollisionAction;
  branch: string;
  head_sha: string;
  intent_id: string | null;
  scheduler_invocation_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const DEFAULT_NON_PROGRESS = new Set<ScheduledWriteCollisionMoveClass>([
  "fresh_status_readback",
  "exact_external_blocker",
  "duplicate_ci_summary",
  "metadata_reread",
  "local_memory_guard",
  "warning_maintenance",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorPath(path: string): boolean {
  return (
    executablePlatformPath(path) &&
    path !== "platform/packages/route-governor/package.json" &&
    path !== "platform/packages/route-governor/src/index.ts" &&
    !/(?:\.test|-proof)\.ts$/.test(path)
  );
}

function base(input: ScheduledWriteCollisionFenceInput): Pick<
  ScheduledWriteCollisionFenceVerdict,
  "branch" | "head_sha" | "intent_id" | "scheduler_invocation_id"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    intent_id: input.candidate.intent_id.trim() || null,
    scheduler_invocation_id: input.candidate.scheduler_invocation_id.trim() || null,
  };
}

function block(
  input: ScheduledWriteCollisionFenceInput,
  action: Exclude<ScheduledWriteCollisionAction, "admit_scheduled_write">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ScheduledWriteCollisionFenceVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function incompleteIncrementBlockers(candidate: ScheduledWriteCollisionCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.write_class.trim()) blockers.push("scheduled write collision fence has no write class");
  if (!candidate.changed_files.some(behaviorPath)) {
    blockers.push("scheduled write collision fence has no behavior-bearing platform file");
  }
  if (candidate.behavior_artifacts.length === 0) {
    blockers.push("scheduled write collision fence has no behavior artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("scheduled write collision fence has no future-routing artifact evidence");
  }
  if (candidate.proof_artifacts.length === 0) {
    blockers.push("scheduled write collision fence has no proof artifact evidence");
  }

  return blockers;
}

export function fenceScheduledWriteCollision(
  input: ScheduledWriteCollisionFenceInput,
): ScheduledWriteCollisionFenceVerdict {
  const candidate = input.candidate;
  const intentId = candidate.intent_id.trim();
  const invocationId = candidate.scheduler_invocation_id.trim();

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`scheduled write branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind scheduled write collision fencing to the active PR branch before acquiring write authority",
    );
  }

  if (!intentId || !invocationId) {
    return block(
      input,
      "block_missing_intent",
      [
        !intentId ? "scheduled write collision fence has no intent id" : "",
        !invocationId ? "scheduled write collision fence has no scheduler invocation id" : "",
      ].filter(Boolean),
      "name the scheduled write intent and invocation before touching the branch",
    );
  }

  if (input.open_intent_ids.includes(intentId) || input.completed_intent_ids.includes(intentId)) {
    return block(
      input,
      "block_intent_collision",
      [`scheduled write intent is already active or completed: ${intentId}`],
      "choose a fresh intent id or consume the already recorded result instead of writing again",
      [intentId, invocationId],
    );
  }

  if (candidate.observed_head_sha !== input.live_head_sha || candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_observed_head",
      [
        `scheduled write observed ${candidate.observed_head_sha}`,
        `scheduled write base ${candidate.base_head_sha}`,
        `live head ${input.live_head_sha}`,
      ],
      "refresh the live PR head and recompile the write intent before writing",
    );
  }

  if (
    input.repaired_historical_heads.includes(candidate.observed_head_sha) ||
    input.repaired_historical_heads.includes(candidate.base_head_sha)
  ) {
    return block(
      input,
      "block_repaired_head_base",
      [`scheduled write is based on repaired historical head ${candidate.base_head_sha}`],
      "keep repaired-head receipts as history only; scheduled writes must bind to the live PR head",
      input.repaired_historical_heads.map((head) => `repaired historical head ${head}`),
    );
  }

  if (candidate.status_claim_head_sha && candidate.status_claim_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_status_claim_substitution",
      [`status claim ${candidate.status_claim_head_sha} is not live head ${input.live_head_sha}`],
      "do not substitute stale status authority for a scheduled executable branch write",
    );
  }

  if (
    DEFAULT_NON_PROGRESS.has(candidate.move_class) ||
    input.non_progress_move_classes.includes(candidate.move_class)
  ) {
    return block(
      input,
      "block_non_progress_move",
      [`scheduled write collision fence cannot admit ${candidate.move_class}`],
      "choose a non-repeated executable platform embodiment or stop at the exact blocker outside the write lane",
      [candidate.move_class],
    );
  }

  if (input.spent_write_classes.includes(candidate.write_class)) {
    return block(
      input,
      "block_repeated_write_class",
      [`scheduled write class already spent: ${candidate.write_class}`],
      "choose an unspent write class before another scheduled continuation moves the branch",
    );
  }

  const incomplete = incompleteIncrementBlockers(candidate);
  if (incomplete.length > 0) {
    return block(
      input,
      "block_incomplete_increment",
      incomplete,
      "complete behavior, future-routing, and proof evidence before scheduled write admission",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_scheduled_write",
    decisive_evidence: [
      intentId,
      invocationId,
      `live head ${input.live_head_sha}`,
      candidate.write_class,
      ...candidate.changed_files.filter(behaviorPath),
      ...candidate.behavior_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route:
      "execute exactly one scheduled branch write for this intent, then record completion and bind status to the moved head",
  };
}
