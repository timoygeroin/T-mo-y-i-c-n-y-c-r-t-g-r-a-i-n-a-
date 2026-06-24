export type PostRepairStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export type PostRepairMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "duplicate_repaired_head_readback"
  | "duplicate_ci_summary"
  | "metadata_reread"
  | "reclose_resolved_blocker";

export type PostRepairAdmissionAction =
  | "admit_post_repair_embodiment"
  | "admit_fresh_moved_head_readback"
  | "emit_exact_external_blocker"
  | "block_repaired_head_replay"
  | "block_non_progress_class"
  | "block_branch_mismatch"
  | "block_stale_base_head"
  | "block_live_status_not_green"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export interface PostRepairEmbodimentCandidate {
  candidate_id: string;
  move_class: PostRepairMoveClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
}

export interface PostRepairAdmissionInput {
  active_branch: string;
  live_head_sha: string;
  repaired_head_sha: string;
  last_status_readback_head_sha: string;
  resolved_blocker_ids: string[];
  live_status_verdict: PostRepairStatusVerdict;
  candidate: PostRepairEmbodimentCandidate;
}

export interface PostRepairAdmissionVerdict {
  ok: boolean;
  action: PostRepairAdmissionAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  retired_head_shas: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<PostRepairMoveClass>([
  "duplicate_repaired_head_readback",
  "duplicate_ci_summary",
  "metadata_reread",
  "reclose_resolved_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: PostRepairAdmissionInput): Pick<PostRepairAdmissionVerdict, "branch" | "head_sha" | "retired_head_shas"> {
  const retired = new Set<string>();
  if (input.repaired_head_sha !== input.live_head_sha) retired.add(input.repaired_head_sha);
  if (input.last_status_readback_head_sha !== input.live_head_sha) retired.add(input.last_status_readback_head_sha);

  return {
    branch: input.candidate.branch,
    head_sha: input.live_head_sha,
    retired_head_shas: [...retired],
  };
}

function block(
  input: PostRepairAdmissionInput,
  action: Exclude<
    PostRepairAdmissionAction,
    "admit_post_repair_embodiment" | "admit_fresh_moved_head_readback" | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): PostRepairAdmissionVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(candidate: PostRepairEmbodimentCandidate): string[] {
  const executableChanges = candidate.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (!candidate.candidate_id.trim()) blockers.push("post-repair embodiment candidate has no candidate id");
  if (executableChanges.length === 0) blockers.push("post-repair embodiment changes no executable platform file");
  if (executableChanges.length > 0 && behaviorChanges.length === 0) {
    blockers.push("post-repair embodiment is proof-only and has no behavior file");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("post-repair embodiment has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("post-repair embodiment has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("post-repair embodiment has no proof artifact evidence");

  return blockers;
}

export function admitPostRepairEmbodiment(input: PostRepairAdmissionInput): PostRepairAdmissionVerdict {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind post-repair progress to the active PR branch before release",
    );
  }

  if (NON_PROGRESS_CLASSES.has(candidate.move_class)) {
    return block(
      input,
      candidate.move_class === "duplicate_repaired_head_readback" ? "block_repaired_head_replay" : "block_non_progress_class",
      [`post-repair move class is non-progress: ${candidate.move_class}`],
      "choose a non-repeated executable embodiment, a moved-head status readback, or one exact blocker",
      [candidate.move_class, ...input.resolved_blocker_ids],
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      candidate.base_head_sha === input.repaired_head_sha ? "block_repaired_head_replay" : "block_stale_base_head",
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the candidate to the live PR head; preserve the repaired head only as retired evidence",
      [`repaired head ${input.repaired_head_sha}`, `last readback head ${input.last_status_readback_head_sha}`],
    );
  }

  if (candidate.move_class === "fresh_status_readback") {
    const movedSinceReadback = input.live_head_sha !== input.last_status_readback_head_sha;
    if (!movedSinceReadback) {
      return block(
        input,
        "block_repaired_head_replay",
        ["fresh status readback is not allowed until the PR head moves beyond the repaired-head readback"],
        "commit a non-repeated embodiment or name one exact blocker before another status readback",
        [`last status readback head ${input.last_status_readback_head_sha}`],
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_fresh_moved_head_readback",
      decisive_evidence: [`head moved from ${input.last_status_readback_head_sha} to ${input.live_head_sha}`],
      blockers: [],
      next_route: "read only status surfaces bound to the moved live head",
    };
  }

  if (candidate.move_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["post-repair exact blocker candidate has no blocker text"],
        "name one exact external blocker or choose executable embodiment",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
      blockers: [blocker],
      next_route: "remove the named blocker before claiming post-repair progress",
    };
  }

  if (input.live_status_verdict !== "passing" && input.live_status_verdict !== "passing_with_warnings") {
    return block(
      input,
      "block_live_status_not_green",
      [`live head status is ${input.live_status_verdict}`],
      "obtain passing live-head status or surface the exact live blocker before post-repair embodiment",
    );
  }

  const blockers = embodimentBlockers(candidate);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_embodiment",
      blockers,
      "supply behavior-bearing executable, routing, and proof evidence before moving the branch",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_post_repair_embodiment",
    decisive_evidence: [
      `repaired head retired: ${input.repaired_head_sha}`,
      ...input.resolved_blocker_ids.map((id) => `resolved blocker retired: ${id}`),
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.proof_artifacts,
    ],
    blockers: [],
    next_route: "commit the post-repair embodiment, then require status readback only for the moved branch head",
  };
}
