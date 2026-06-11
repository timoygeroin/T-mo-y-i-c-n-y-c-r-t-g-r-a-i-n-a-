export type CurrentInstructionMoveClass = "external_platform_embodiment" | "fresh_status_readback" | "exact_external_blocker";

export type CurrentInstructionHeadBoundaryAction =
  | "admit_live_head_embodiment"
  | "read_live_head_status"
  | "preserve_resolved_head_history"
  | "block_stale_instruction_head_as_current"
  | "block_prohibited_instruction_blocker"
  | "block_branch_mismatch"
  | "block_incomplete_embodiment";

export interface CurrentInstructionEmbodimentCandidate {
  move_class: CurrentInstructionMoveClass;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  blocker?: string;
}

export interface CurrentInstructionHeadBoundaryInput {
  active_branch: string;
  instruction_branch: string;
  instruction_head_sha: string;
  live_head_sha: string;
  resolved_repaired_head_sha?: string;
  repaired_head_status_resolved: boolean;
  prohibited_blockers: string[];
  candidate: CurrentInstructionEmbodimentCandidate;
}

export interface CurrentInstructionHeadBoundaryVerdict {
  ok: boolean;
  action: CurrentInstructionHeadBoundaryAction;
  branch: string;
  head_sha: string;
  instruction_head_allowed_as_current: boolean;
  historical_head_sha: string | null;
  quarantined_head_sha: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function resolvedHistoricalHead(input: CurrentInstructionHeadBoundaryInput): string | null {
  if (!input.resolved_repaired_head_sha || !input.repaired_head_status_resolved) return null;
  if (input.instruction_head_sha === input.resolved_repaired_head_sha) return input.resolved_repaired_head_sha;
  return null;
}

function base(input: CurrentInstructionHeadBoundaryInput): Pick<
  CurrentInstructionHeadBoundaryVerdict,
  "branch" | "head_sha" | "historical_head_sha" | "quarantined_head_sha" | "instruction_head_allowed_as_current"
> {
  const instructionHeadIsLive = input.instruction_head_sha === input.live_head_sha;
  const historical = resolvedHistoricalHead(input);

  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    instruction_head_allowed_as_current: instructionHeadIsLive,
    historical_head_sha: historical,
    quarantined_head_sha: instructionHeadIsLive ? null : input.instruction_head_sha,
  };
}

function incompleteEmbodiment(candidate: CurrentInstructionEmbodimentCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("embodiment candidate changes no executable platform file");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("embodiment candidate has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("embodiment candidate has no future-routing artifact evidence");
  }

  return blockers;
}

export function arbitrateCurrentInstructionHeadBoundary(
  input: CurrentInstructionHeadBoundaryInput,
): CurrentInstructionHeadBoundaryVerdict {
  const baseVerdict = base(input);
  const candidate = input.candidate;

  if (input.instruction_branch !== input.active_branch) {
    return {
      ...baseVerdict,
      ok: false,
      action: "block_branch_mismatch",
      decisive_evidence: [],
      blockers: [`instruction branch ${input.instruction_branch} does not match active branch ${input.active_branch}`],
      next_route: "rebind the current instruction to the active manifestation branch before release",
    };
  }

  const attemptedBlocker = candidate.blocker?.trim();
  if (attemptedBlocker && input.prohibited_blockers.includes(attemptedBlocker)) {
    return {
      ...baseVerdict,
      ok: false,
      action: "block_prohibited_instruction_blocker",
      decisive_evidence: [`current instruction prohibits blocker: ${attemptedBlocker}`],
      blockers: [`prohibited blocker cannot be emitted from current instruction: ${attemptedBlocker}`],
      next_route: "preserve the instruction prohibition and continue from the live PR head",
    };
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return {
      ...baseVerdict,
      ok: false,
      action: "block_stale_instruction_head_as_current",
      decisive_evidence: [
        `instruction head ${input.instruction_head_sha}`,
        `live head ${input.live_head_sha}`,
        ...(baseVerdict.historical_head_sha ? [`resolved historical head ${baseVerdict.historical_head_sha}`] : []),
      ],
      blockers: [`candidate base ${candidate.base_head_sha} is not live PR head ${input.live_head_sha}`],
      next_route: "rebase the candidate to the live PR head; keep stale instruction head only as historical resolved context",
    };
  }

  if (candidate.move_class === "fresh_status_readback") {
    return {
      ...baseVerdict,
      ok: true,
      action: "read_live_head_status",
      decisive_evidence: [
        `current instruction accepted as route authority on ${input.active_branch}`,
        `live PR head ${input.live_head_sha}`,
        ...(input.instruction_head_sha !== input.live_head_sha
          ? [`instruction-carried head ${input.instruction_head_sha} is not current`]
          : []),
      ],
      blockers: [],
      next_route: "read status for the live PR head before making any pass/fail status claim",
    };
  }

  if (candidate.move_class === "exact_external_blocker") {
    return {
      ...baseVerdict,
      ok: true,
      action: baseVerdict.historical_head_sha ? "preserve_resolved_head_history" : "read_live_head_status",
      decisive_evidence: [candidate.blocker ?? "exact external blocker supplied", `live PR head ${input.live_head_sha}`],
      blockers: candidate.blocker ? [candidate.blocker] : [],
      next_route: candidate.blocker
        ? "remove the named live-head blocker before claiming another embodiment"
        : "name the exact live-head blocker before release",
    };
  }

  const blockers = incompleteEmbodiment(candidate);
  if (blockers.length > 0) {
    return {
      ...baseVerdict,
      ok: false,
      action: "block_incomplete_embodiment",
      decisive_evidence: [],
      blockers,
      next_route: "complete executable, routing, and changed-file evidence before moving the branch",
    };
  }

  return {
    ...baseVerdict,
    ok: true,
    action: "admit_live_head_embodiment",
    decisive_evidence: [
      `current instruction accepted as route authority on ${input.active_branch}`,
      `live PR head ${input.live_head_sha}`,
      ...(baseVerdict.historical_head_sha ? [`resolved repaired head preserved as history ${baseVerdict.historical_head_sha}`] : []),
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
    ],
    blockers: [],
    next_route: "commit the live-head embodiment, then bind the next status readback to the moved head",
  };
}
