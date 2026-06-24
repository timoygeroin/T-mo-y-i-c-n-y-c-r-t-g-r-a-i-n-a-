export type HeadMoveFileClass = "executable_behavior" | "proof_wiring" | "status_surface" | "documentation" | "other";

export type HeadMoveReleaseClass =
  | "external_embodiment_increment"
  | "fresh_status_readback_required"
  | "exact_blocker_required"
  | "blocked_non_progress";

export interface HeadMoveChangedFile {
  path: string;
  class: HeadMoveFileClass;
}

export interface HeadMoveClassifierInput {
  branch: string;
  active_branch: string;
  previous_head_sha: string;
  live_head_sha: string;
  changed_files: HeadMoveChangedFile[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  status_surface_ids: string[];
  exact_blocker?: string;
}

export interface HeadMoveClassifierVerdict {
  ok: boolean;
  release_class: HeadMoveReleaseClass;
  branch: string;
  live_head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorFiles(input: HeadMoveClassifierInput): HeadMoveChangedFile[] {
  return input.changed_files.filter(
    (file) => file.class === "executable_behavior" && executablePlatformPath(file.path),
  );
}

function proofWiringOnly(input: HeadMoveClassifierInput): boolean {
  return (
    input.changed_files.length > 0 &&
    input.changed_files.every((file) => file.class === "proof_wiring" || file.class === "documentation")
  );
}

function base(input: HeadMoveClassifierInput): Pick<HeadMoveClassifierVerdict, "branch" | "live_head_sha"> {
  return { branch: input.branch, live_head_sha: input.live_head_sha };
}

function block(input: HeadMoveClassifierInput, blockers: string[], nextRoute: string): HeadMoveClassifierVerdict {
  return {
    ...base(input),
    ok: false,
    release_class: "blocked_non_progress",
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

export function classifyHeadMove(input: HeadMoveClassifierInput): HeadMoveClassifierVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      [`head-move branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind the moved head to the active PR branch before release",
    );
  }

  if (input.live_head_sha === input.previous_head_sha) {
    if (input.status_surface_ids.length > 0) {
      return {
        ...base(input),
        ok: true,
        release_class: "fresh_status_readback_required",
        decisive_evidence: input.status_surface_ids.map((id) => `current-head status surface: ${id}`),
        blockers: [],
        next_route: "compile the current-head status surface before selecting another embodiment class",
      };
    }

    if (input.exact_blocker?.trim()) {
      return {
        ...base(input),
        ok: true,
        release_class: "exact_blocker_required",
        decisive_evidence: [input.exact_blocker],
        blockers: [input.exact_blocker],
        next_route: "remove the exact blocker before attempting another progress class",
      };
    }

    return block(
      input,
      [`live head ${input.live_head_sha} did not move and no current-head status surface or blocker is attached`],
      "choose a new executable embodiment, attach a current-head status surface, or name the exact blocker",
    );
  }

  const executableBehaviorFiles = behaviorFiles(input);
  if (executableBehaviorFiles.length > 0) {
    const blockers: string[] = [];
    if (input.executable_artifacts.length === 0) blockers.push("moved head has behavior files but no executable artifact names");
    if (input.routing_artifacts.length === 0) blockers.push("moved head has behavior files but no future-routing artifact names");
    if (input.proof_artifacts.length === 0) blockers.push("moved head has behavior files but no proof artifact names");

    if (blockers.length > 0) {
      return block(input, blockers, "complete executable, routing, and proof evidence before counting the moved head");
    }

    return {
      ...base(input),
      ok: true,
      release_class: "external_embodiment_increment",
      decisive_evidence: [
        `head moved from ${input.previous_head_sha} to ${input.live_head_sha}`,
        ...executableBehaviorFiles.map((file) => file.path),
        ...input.executable_artifacts,
        ...input.routing_artifacts,
        ...input.proof_artifacts,
      ],
      blockers: [],
      next_route: "after the behavior-bearing head move, require live-head status readback before the next release claim",
    };
  }

  if (proofWiringOnly(input)) {
    return {
      ...base(input),
      ok: true,
      release_class: "fresh_status_readback_required",
      decisive_evidence: [
        `head moved from ${input.previous_head_sha} to ${input.live_head_sha}`,
        ...input.changed_files.map((file) => `${file.class}:${file.path}`),
      ],
      blockers: [],
      next_route: "treat proof-wiring-only movement as a status-readback target, not as external embodiment progress",
    };
  }

  if (input.status_surface_ids.length > 0) {
    return {
      ...base(input),
      ok: true,
      release_class: "fresh_status_readback_required",
      decisive_evidence: input.status_surface_ids.map((id) => `current-head status surface: ${id}`),
      blockers: [],
      next_route: "compile the current-head status surface before selecting another embodiment class",
    };
  }

  if (input.exact_blocker?.trim()) {
    return {
      ...base(input),
      ok: true,
      release_class: "exact_blocker_required",
      decisive_evidence: [input.exact_blocker],
      blockers: [input.exact_blocker],
      next_route: "remove the exact blocker before attempting another progress class",
    };
  }

  return block(
    input,
    ["moved head has no executable behavior change, status surface, or exact blocker"],
    "do not count metadata-only or unclassified head movement as progress",
  );
}
