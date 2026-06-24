export type FinalizationCommandSourceAction =
  | "route_to_external_embodiment"
  | "route_to_live_status_readback"
  | "route_to_failure_detail"
  | "route_to_exact_blocker"
  | "block_scheduled_finalization";

export type FinalizationCommandKind =
  | "commit_external_embodiment"
  | "read_live_head_status"
  | "repair_live_head_failure"
  | "emit_exact_external_blocker"
  | "block_release";

export interface FinalizationRoutedDecision {
  ok: boolean;
  action: FinalizationCommandSourceAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

export interface FinalizationCommandInput {
  active_branch: string;
  live_head_sha: string;
  decision: FinalizationRoutedDecision;
  command_id: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
}

export interface FinalizationCommand {
  ok: boolean;
  command_id: string;
  command_kind: FinalizationCommandKind;
  branch: string;
  head_sha: string;
  required_surfaces: string[];
  executable_artifacts: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_required_action: string;
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function behaviorFiles(files: string[]): string[] {
  return files.filter((path) => executablePlatformPath(path) && !proofPath(path));
}

function base(input: FinalizationCommandInput): Pick<FinalizationCommand, "command_id" | "branch" | "head_sha"> {
  return {
    command_id: input.command_id,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
  };
}

function block(input: FinalizationCommandInput, blockers: string[], nextRequiredAction: string): FinalizationCommand {
  return {
    ...base(input),
    ok: false,
    command_kind: "block_release",
    required_surfaces: [],
    executable_artifacts: [],
    decisive_evidence: [],
    blockers,
    next_required_action: nextRequiredAction,
  };
}

function sharedBlockers(input: FinalizationCommandInput): string[] {
  const blockers: string[] = [];

  if (!input.command_id.trim()) blockers.push("finalization command has no command id");
  if (input.decision.branch !== input.active_branch) {
    blockers.push(`decision branch ${input.decision.branch} does not match active branch ${input.active_branch}`);
  }
  if (input.decision.head_sha !== input.live_head_sha) {
    blockers.push(`decision head ${input.decision.head_sha} does not match live head ${input.live_head_sha}`);
  }

  return blockers;
}

function completeEmbodimentBlockers(input: FinalizationCommandInput): string[] {
  const blockers: string[] = [];
  const changedBehavior = behaviorFiles(input.changed_files);

  if (changedBehavior.length === 0) blockers.push("external command has no behavior-bearing platform file");
  if (input.executable_artifacts.length === 0) blockers.push("external command has no executable artifact evidence");
  if (input.routing_artifacts.length === 0) blockers.push("external command has no future-routing artifact evidence");
  if (input.proof_artifacts.length === 0) blockers.push("external command has no proof artifact evidence");

  return blockers;
}

export function compileFinalizationCommand(input: FinalizationCommandInput): FinalizationCommand {
  const shared = sharedBlockers(input);
  if (shared.length > 0) {
    return block(input, shared, "rebind the routed decision to the active branch and live head before command release");
  }

  const decision = input.decision;
  if (!decision.ok) {
    const blockers = decision.blockers.length > 0 ? decision.blockers : ["routed decision is not ok"];
    return {
      ...base(input),
      ok: false,
      command_kind: "block_release",
      required_surfaces: [],
      executable_artifacts: [],
      decisive_evidence: decision.decisive_evidence,
      blockers,
      next_required_action: decision.next_route,
    };
  }

  if (decision.action === "route_to_external_embodiment") {
    const blockers = completeEmbodimentBlockers(input);
    if (blockers.length > 0) {
      return block(input, blockers, "supply behavior file, executable artifact, routing artifact, and proof artifact before commit");
    }

    return {
      ...base(input),
      ok: true,
      command_kind: "commit_external_embodiment",
      required_surfaces: ["github_contents_write", "moved_head_status_readback"],
      executable_artifacts: [...input.executable_artifacts],
      decisive_evidence: [
        ...decision.decisive_evidence,
        ...behaviorFiles(input.changed_files),
        ...input.executable_artifacts,
        ...input.routing_artifacts,
        ...input.proof_artifacts,
      ],
      blockers: [],
      next_required_action: "write the behavior-bearing files, then read status only for the moved PR head",
    };
  }

  if (decision.action === "route_to_live_status_readback") {
    return {
      ...base(input),
      ok: true,
      command_kind: "read_live_head_status",
      required_surfaces: ["github_checks_api", "github_actions_runs_api"],
      executable_artifacts: [],
      decisive_evidence: decision.decisive_evidence,
      blockers: [],
      next_required_action: "publish only a live-head status verdict or route to the surfaced live failure",
    };
  }

  if (decision.action === "route_to_failure_detail") {
    return {
      ...base(input),
      ok: true,
      command_kind: "repair_live_head_failure",
      required_surfaces: ["github_actions_log_or_artifact", "github_contents_write"],
      executable_artifacts: [...input.executable_artifacts],
      decisive_evidence: [...decision.decisive_evidence, ...input.executable_artifacts],
      blockers: [],
      next_required_action: "repair only the detailed live-head failure and require moved-head status afterward",
    };
  }

  if (decision.action === "route_to_exact_blocker") {
    if (decision.blockers.length === 0) {
      return block(input, ["exact blocker route has no blocker text"], "name the exact external blocker before release");
    }

    return {
      ...base(input),
      ok: true,
      command_kind: "emit_exact_external_blocker",
      required_surfaces: [],
      executable_artifacts: [],
      decisive_evidence: decision.decisive_evidence,
      blockers: decision.blockers,
      next_required_action: "remove the named blocker before another finalization command",
    };
  }

  return block(input, [`source action cannot become a terminal command: ${decision.action}`], "route to embodiment, live status, failure detail, or exact blocker");
}
