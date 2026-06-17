export type TerminalProgressClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "pr_metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_resolved_blocker";

export type TerminalProgressAction =
  | "admit_external_embodiment"
  | "admit_fresh_status_readback"
  | "admit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_non_progress_class"
  | "block_stale_status_readback"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export interface TerminalCheckRunEvidence {
  id: string;
  head_sha: string;
  name: string;
}

export interface TerminalProgressCandidate {
  progress_class: TerminalProgressClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts?: string[];
  new_check_runs: TerminalCheckRunEvidence[];
  blocker?: string;
}

export interface FinalizationTerminalProgressInput {
  active_branch: string;
  live_head_sha: string;
  previous_status_head_sha: string;
  prohibited_progress_classes: TerminalProgressClass[];
  resolved_historical_heads: string[];
  candidate: TerminalProgressCandidate;
}

export interface FinalizationTerminalProgressVerdict {
  ok: boolean;
  action: TerminalProgressAction;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  quarantined_heads: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: FinalizationTerminalProgressInput): Pick<
  FinalizationTerminalProgressVerdict,
  "branch" | "head_sha" | "quarantined_heads"
> {
  const quarantined = new Set(input.resolved_historical_heads.filter((head) => head !== input.live_head_sha));
  if (input.previous_status_head_sha !== input.live_head_sha) quarantined.add(input.previous_status_head_sha);
  if (input.candidate.base_head_sha !== input.live_head_sha) quarantined.add(input.candidate.base_head_sha);

  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    quarantined_heads: [...quarantined],
  };
}

function block(
  input: FinalizationTerminalProgressInput,
  action: Exclude<
    TerminalProgressAction,
    "admit_external_embodiment" | "admit_fresh_status_readback" | "admit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): FinalizationTerminalProgressVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function currentHeadCheckRuns(input: FinalizationTerminalProgressInput): TerminalCheckRunEvidence[] {
  return input.candidate.new_check_runs.filter((run) => run.head_sha === input.live_head_sha);
}

function incompleteEmbodiment(candidate: TerminalProgressCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("terminal embodiment changes no executable platform file");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("terminal embodiment has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("terminal embodiment has no future-routing artifact evidence");
  }
  if ((candidate.proof_artifacts ?? []).length === 0) {
    blockers.push("terminal embodiment has no proof artifact evidence");
  }

  return blockers;
}

export function enforceFinalizationTerminalProgress(
  input: FinalizationTerminalProgressInput,
): FinalizationTerminalProgressVerdict {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "rebind terminal progress to the active manifestation branch before release",
    );
  }

  if (input.prohibited_progress_classes.includes(candidate.progress_class)) {
    return block(
      input,
      "block_non_progress_class",
      [`prohibited terminal progress class: ${candidate.progress_class}`],
      "choose external embodiment, legitimately fresh status readback, or one exact external blocker",
      [candidate.progress_class],
    );
  }

  if (candidate.progress_class === "external_platform_embodiment") {
    if (candidate.base_head_sha !== input.live_head_sha) {
      return block(
        input,
        "block_incomplete_embodiment",
        [`terminal embodiment base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
        "rebase the embodiment candidate to the live PR head before moving the branch",
      );
    }

    const blockers = incompleteEmbodiment(candidate);
    if (blockers.length > 0) {
      return block(
        input,
        "block_incomplete_embodiment",
        blockers,
        "supply executable file, executable artifact, routing artifact, and proof artifact evidence for the terminal embodiment",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_external_embodiment",
      decisive_evidence: [
        `live head ${input.live_head_sha}`,
        ...candidate.changed_files.filter(executablePlatformPath),
        ...candidate.executable_artifacts,
        ...candidate.routing_artifacts,
        ...(candidate.proof_artifacts ?? []),
      ],
      blockers: [],
      next_route: "commit the external embodiment, then read status only for the moved live head",
    };
  }

  if (candidate.progress_class === "fresh_status_readback") {
    const headMoved = input.live_head_sha !== input.previous_status_head_sha;
    const freshChecks = currentHeadCheckRuns(input);

    if (!headMoved && freshChecks.length === 0) {
      return block(
        input,
        "block_stale_status_readback",
        ["fresh status readback requires a moved PR head or new check evidence on the live head"],
        "do not publish another status readback until the head moves or new live-head checks appear",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_fresh_status_readback",
      decisive_evidence: [
        ...(headMoved ? [`head moved from ${input.previous_status_head_sha} to ${input.live_head_sha}`] : []),
        ...freshChecks.map((run) => `new live-head check ${run.id}: ${run.name}`),
      ],
      blockers: [],
      next_route: "read and publish only the live-head status surface; do not replay older repaired-head checks",
    };
  }

  if (candidate.progress_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["exact external blocker progress class has no blocker text"],
        "name the exact external blocker or choose a valid embodiment/readback route",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_exact_external_blocker",
      decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
      blockers: [blocker],
      next_route: "remove the named blocker before attempting another terminal progress class",
    };
  }

  return block(
    input,
    "block_non_progress_class",
    [`terminal progress class is not one of the three admitted outcomes: ${candidate.progress_class}`],
    "choose external embodiment, legitimately fresh status readback, or one exact external blocker",
  );
}
