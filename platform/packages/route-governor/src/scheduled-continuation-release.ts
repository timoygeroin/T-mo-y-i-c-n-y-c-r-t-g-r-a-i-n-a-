export type ScheduledContinuationReleaseClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "old_repaired_head_blocker";

export type ScheduledContinuationReleaseAction =
  | "release_external_embodiment_packet"
  | "release_fresh_status_packet"
  | "release_exact_blocker_packet"
  | "block_branch_mismatch"
  | "block_stale_base_head"
  | "block_non_progress_class"
  | "block_incomplete_external_embodiment"
  | "block_stale_status_readback"
  | "block_missing_exact_blocker"
  | "block_prohibited_blocker";

export interface ScheduledContinuationReleaseCandidate {
  release_id: string;
  release_class: ScheduledContinuationReleaseClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  status_surface_ids: string[];
  exact_blocker?: string;
  resulting_head_sha?: string;
}

export interface ScheduledContinuationReleaseInput {
  active_branch: string;
  live_head_sha: string;
  prompt_head_sha: string;
  previous_status_head_sha: string;
  prohibited_release_classes: ScheduledContinuationReleaseClass[];
  prohibited_blockers: string[];
  candidate: ScheduledContinuationReleaseCandidate;
}

export interface ScheduledContinuationReleasePacket {
  ok: boolean;
  action: ScheduledContinuationReleaseAction;
  branch: string;
  base_head_sha: string;
  release_id: string;
  release_class: ScheduledContinuationReleaseClass;
  next_status_expected_head: string | null;
  quarantined_prompt_head: string | null;
  decisive_evidence: string[];
  blockers: string[];
  release_instruction: string;
}

const NON_PROGRESS_CLASSES = new Set<ScheduledContinuationReleaseClass>([
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "old_repaired_head_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: ScheduledContinuationReleaseInput): Pick<
  ScheduledContinuationReleasePacket,
  "branch" | "base_head_sha" | "release_id" | "release_class" | "quarantined_prompt_head"
> {
  return {
    branch: input.active_branch,
    base_head_sha: input.live_head_sha,
    release_id: input.candidate.release_id,
    release_class: input.candidate.release_class,
    quarantined_prompt_head: input.prompt_head_sha === input.live_head_sha ? null : input.prompt_head_sha,
  };
}

function block(
  input: ScheduledContinuationReleaseInput,
  action: Exclude<
    ScheduledContinuationReleaseAction,
    "release_external_embodiment_packet" | "release_fresh_status_packet" | "release_exact_blocker_packet"
  >,
  blockers: string[],
  instruction: string,
  evidence: string[] = [],
): ScheduledContinuationReleasePacket {
  return {
    ...base(input),
    ok: false,
    action,
    next_status_expected_head: null,
    decisive_evidence: evidence,
    blockers,
    release_instruction: instruction,
  };
}

function externalEmbodimentBlockers(candidate: ScheduledContinuationReleaseCandidate): string[] {
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (!candidate.release_id.trim()) blockers.push("scheduled release packet has no release id");
  if (executableChanges.length === 0) blockers.push("scheduled release changes no executable platform file");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("scheduled release is proof-only and changes no behavior file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("scheduled release has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("scheduled release has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("scheduled release has no proof artifact evidence");

  return blockers;
}

function statusReadbackFresh(input: ScheduledContinuationReleaseInput): boolean {
  return input.previous_status_head_sha !== input.live_head_sha || input.candidate.status_surface_ids.length > 0;
}

export function compileScheduledContinuationRelease(
  input: ScheduledContinuationReleaseInput,
): ScheduledContinuationReleasePacket {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`scheduled release branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "rebind the scheduled release to the active PR branch before release",
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_base_head",
      [`scheduled release base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "discard stale prompt/body heads and rebuild the release packet from live PR metadata",
      [`prompt head ${input.prompt_head_sha}`, `live head ${input.live_head_sha}`],
    );
  }

  if (NON_PROGRESS_CLASSES.has(candidate.release_class) || input.prohibited_release_classes.includes(candidate.release_class)) {
    return block(
      input,
      "block_non_progress_class",
      [`scheduled release class is not progress: ${candidate.release_class}`],
      "choose external embodiment, legitimately fresh status readback, or one exact external blocker",
      [candidate.release_class],
    );
  }

  if (candidate.release_class === "external_platform_embodiment") {
    const blockers = externalEmbodimentBlockers(candidate);
    if (blockers.length > 0) {
      return block(
        input,
        "block_incomplete_external_embodiment",
        blockers,
        "attach behavior-bearing executable, routing, and proof evidence before moving the branch",
      );
    }

    const nextHead = candidate.resulting_head_sha ?? "post-write-head";
    return {
      ...base(input),
      ok: true,
      action: "release_external_embodiment_packet",
      next_status_expected_head: nextHead,
      decisive_evidence: [
        candidate.release_id,
        `live head ${input.live_head_sha}`,
        ...candidate.changed_files.filter(executablePlatformPath),
        ...candidate.executable_artifacts,
        ...candidate.routing_artifacts,
        ...candidate.proof_artifacts,
        `next status expected head ${nextHead}`,
      ],
      blockers: [],
      release_instruction: "commit this behavior-bearing embodiment, then read status only for the moved resulting head",
    };
  }

  if (candidate.release_class === "fresh_status_readback") {
    if (!statusReadbackFresh(input)) {
      return block(
        input,
        "block_stale_status_readback",
        ["scheduled status readback is not fresh: live head did not move and no new status surface id is attached"],
        "do not replay repaired-head or PR-body status summaries as fresh readback",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "release_fresh_status_packet",
      next_status_expected_head: input.live_head_sha,
      decisive_evidence: [
        candidate.release_id,
        ...(input.previous_status_head_sha !== input.live_head_sha
          ? [`head moved from ${input.previous_status_head_sha} to ${input.live_head_sha}`]
          : []),
        ...candidate.status_surface_ids.map((surface) => `status surface ${surface}`),
      ],
      blockers: [],
      release_instruction: "publish only the live-head-bound status readback, then choose a non-repeated embodiment or exact blocker",
    };
  }

  const blocker = candidate.exact_blocker?.trim();
  if (!blocker) {
    return block(
      input,
      "block_missing_exact_blocker",
      ["scheduled exact blocker packet has no blocker text"],
      "name one exact live-head external blocker or choose embodiment/status readback",
    );
  }

  if (input.prohibited_blockers.includes(blocker)) {
    return block(
      input,
      "block_prohibited_blocker",
      [`scheduled exact blocker is prohibited: ${blocker}`],
      "discard the prohibited historical blocker and route from live-head evidence only",
      [blocker, `live head ${input.live_head_sha}`],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "release_exact_blocker_packet",
    next_status_expected_head: null,
    decisive_evidence: [candidate.release_id, blocker, `live head ${input.live_head_sha}`],
    blockers: [blocker],
    release_instruction: "emit this exact live-head blocker and stop all other progress classes until it is removed",
  };
}
