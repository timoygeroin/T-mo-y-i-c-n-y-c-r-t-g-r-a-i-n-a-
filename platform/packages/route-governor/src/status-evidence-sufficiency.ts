export type StatusEvidenceProgressClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "pr_metadata_reread";

export type StatusEvidenceSurfaceKind = "check_run" | "workflow_run" | "combined_status";
export type StatusEvidenceSurfaceState = "success" | "failure" | "pending" | "neutral" | "cancelled" | "skipped";

export type StatusEvidenceSufficiencyAction =
  | "admit_current_head_status_readback"
  | "admit_external_embodiment"
  | "admit_exact_external_blocker"
  | "block_metadata_only_status_readback"
  | "block_stale_status_surface"
  | "block_branch_mismatch"
  | "block_stale_base_head"
  | "block_non_progress_class"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export interface StatusEvidenceSurface {
  surface_id: string;
  kind: StatusEvidenceSurfaceKind;
  head_sha: string;
  state: StatusEvidenceSurfaceState;
  name: string;
}

export interface StatusEvidenceCandidate {
  candidate_id: string;
  progress_class: StatusEvidenceProgressClass;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  status_surfaces: StatusEvidenceSurface[];
  blocker?: string;
}

export interface StatusEvidenceSufficiencyInput {
  active_branch: string;
  live_head_sha: string;
  previous_status_head_sha: string;
  candidate: StatusEvidenceCandidate;
}

export interface StatusEvidenceSufficiencyVerdict {
  ok: boolean;
  action: StatusEvidenceSufficiencyAction;
  branch: string;
  head_sha: string;
  candidate_id: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

export interface SelectedStatusEvidenceProgress {
  ok: boolean;
  selected: StatusEvidenceSufficiencyVerdict | null;
  rejected: StatusEvidenceSufficiencyVerdict[];
  blockers: string[];
}

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function behaviorPlatformPath(path: string): boolean {
  return executablePlatformPath(path) && !/(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: StatusEvidenceSufficiencyInput): Pick<
  StatusEvidenceSufficiencyVerdict,
  "branch" | "head_sha" | "candidate_id"
> {
  return {
    branch: input.candidate.branch,
    head_sha: input.live_head_sha,
    candidate_id: input.candidate.candidate_id,
  };
}

function block(
  input: StatusEvidenceSufficiencyInput,
  action: Exclude<
    StatusEvidenceSufficiencyAction,
    "admit_current_head_status_readback" | "admit_external_embodiment" | "admit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): StatusEvidenceSufficiencyVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function surfaceLabel(surface: StatusEvidenceSurface): string {
  return `${surface.kind}:${surface.surface_id}@${surface.head_sha}:${surface.state}:${surface.name}`;
}

function currentHeadSurfaces(input: StatusEvidenceSufficiencyInput): StatusEvidenceSurface[] {
  return input.candidate.status_surfaces.filter((surface) => surface.head_sha === input.live_head_sha);
}

function statusReadbackBlockers(input: StatusEvidenceSufficiencyInput): string[] {
  const currentSurfaces = currentHeadSurfaces(input);
  if (currentSurfaces.length > 0) return [];

  if (input.candidate.status_surfaces.length > 0) {
    return [
      `status surfaces are not bound to live head ${input.live_head_sha}: ${input.candidate.status_surfaces
        .map(surfaceLabel)
        .join(", ")}`,
    ];
  }

  const headMoved = input.live_head_sha !== input.previous_status_head_sha;
  return [
    headMoved
      ? `head moved from ${input.previous_status_head_sha} to ${input.live_head_sha}, but no current-head status surface is attached`
      : `head ${input.live_head_sha} has no new current-head status surface`,
  ];
}

function incompleteEmbodiment(candidate: StatusEvidenceCandidate): string[] {
  const blockers: string[] = [];
  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("embodiment candidate changes no executable platform file");
  }
  if (!candidate.changed_files.some(behaviorPlatformPath)) {
    blockers.push("embodiment candidate changes no behavior-bearing platform file");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("embodiment candidate has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("embodiment candidate has no future-routing artifact evidence");
  }
  return blockers;
}

export function enforceStatusEvidenceSufficiency(
  input: StatusEvidenceSufficiencyInput,
): StatusEvidenceSufficiencyVerdict {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the candidate to the active manifestation branch before release",
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_base_head",
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "restart candidate selection from the live PR head",
    );
  }

  if (candidate.progress_class === "pr_metadata_reread") {
    return block(
      input,
      "block_non_progress_class",
      ["PR metadata reread is not terminal progress and cannot substitute for a status surface"],
      "attach a current-head status surface, commit an embodiment, or name one exact blocker",
      [candidate.progress_class],
    );
  }

  if (candidate.progress_class === "fresh_status_readback") {
    const blockers = statusReadbackBlockers(input);
    if (blockers.length > 0) {
      return block(
        input,
        candidate.status_surfaces.length > 0 ? "block_stale_status_surface" : "block_metadata_only_status_readback",
        blockers,
        "do not count moved-head metadata as fresh status; obtain current-head check evidence or route to embodiment/blocker",
        candidate.status_surfaces.map(surfaceLabel),
      );
    }

    const surfaces = currentHeadSurfaces(input);
    return {
      ...base(input),
      ok: true,
      action: "admit_current_head_status_readback",
      decisive_evidence: surfaces.map(surfaceLabel),
      blockers: [],
      next_route: "publish only this current-head status surface; then choose the next non-repeated embodiment or exact blocker",
    };
  }

  if (candidate.progress_class === "external_platform_embodiment") {
    const blockers = incompleteEmbodiment(candidate);
    if (blockers.length > 0) {
      return block(
        input,
        "block_incomplete_embodiment",
        blockers,
        "supply a behavior-bearing executable embodiment before release",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_external_embodiment",
      decisive_evidence: [
        ...candidate.changed_files.filter(executablePlatformPath),
        ...candidate.executable_artifacts,
        ...candidate.routing_artifacts,
      ],
      blockers: [],
      next_route: "commit the embodiment, then require a current-head status surface for the moved head",
    };
  }

  const blocker = candidate.blocker?.trim();
  if (!blocker) {
    return block(
      input,
      "block_missing_exact_blocker",
      ["exact external blocker candidate has no blocker text"],
      "name the exact external blocker or choose embodiment/status evidence",
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

function priority(verdict: StatusEvidenceSufficiencyVerdict): number {
  if (!verdict.ok) return -1;
  switch (verdict.action) {
    case "admit_current_head_status_readback":
      return 3;
    case "admit_external_embodiment":
      return 2;
    case "admit_exact_external_blocker":
      return 1;
    default:
      return -1;
  }
}

export function selectStatusEvidenceSufficientProgress(
  input: Omit<StatusEvidenceSufficiencyInput, "candidate">,
  candidates: StatusEvidenceCandidate[],
): SelectedStatusEvidenceProgress {
  const verdicts = candidates.map((candidate) => enforceStatusEvidenceSufficiency({ ...input, candidate }));
  const accepted = verdicts.filter((verdict) => verdict.ok).sort((left, right) => priority(right) - priority(left));
  const selected = accepted[0] ?? null;
  const rejected = verdicts.filter((verdict) => !verdict.ok);

  if (!selected) {
    return {
      ok: false,
      selected: null,
      rejected,
      blockers: ["no candidate supplied current-head status evidence, executable embodiment, or exact blocker"],
    };
  }

  return {
    ok: true,
    selected,
    rejected,
    blockers: [],
  };
}
