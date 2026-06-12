export type ManifestationSinkMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "pr_metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "local_memory_guard"
  | "reclose_resolved_blocker";

export type ManifestationSinkBindingAction =
  | "admit_sink_bound_embodiment"
  | "admit_sink_bound_status_readback"
  | "admit_sink_bound_blocker"
  | "block_sink_mismatch"
  | "block_stale_head"
  | "block_non_progress_move"
  | "block_incomplete_evidence"
  | "block_missing_blocker";

export interface ManifestationSink {
  repository: string;
  pr_number: number;
  branch: string;
  live_head_sha: string;
}

export interface ManifestationSinkCandidate {
  repository: string;
  pr_number: number;
  branch: string;
  base_head_sha: string;
  move_class: ManifestationSinkMoveClass;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  status_surface_ids: string[];
  blocker?: string;
}

export interface ManifestationSinkBindingInput {
  sink: ManifestationSink;
  candidate: ManifestationSinkCandidate;
  prohibited_move_classes: ManifestationSinkMoveClass[];
  resolved_historical_heads: string[];
}

export interface ManifestationSinkBindingVerdict {
  ok: boolean;
  action: ManifestationSinkBindingAction;
  repository: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  quarantined_heads: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_MOVE_CLASSES = new Set<ManifestationSinkMoveClass>([
  "pr_metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "local_memory_guard",
  "reclose_resolved_blocker",
]);

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: ManifestationSinkBindingInput): Pick<
  ManifestationSinkBindingVerdict,
  "repository" | "pr_number" | "branch" | "head_sha" | "quarantined_heads"
> {
  const quarantined = new Set(input.resolved_historical_heads.filter((head) => head !== input.sink.live_head_sha));
  if (input.candidate.base_head_sha !== input.sink.live_head_sha) quarantined.add(input.candidate.base_head_sha);

  return {
    repository: input.sink.repository,
    pr_number: input.sink.pr_number,
    branch: input.sink.branch,
    head_sha: input.sink.live_head_sha,
    quarantined_heads: [...quarantined],
  };
}

function block(
  input: ManifestationSinkBindingInput,
  action: Exclude<
    ManifestationSinkBindingAction,
    "admit_sink_bound_embodiment" | "admit_sink_bound_status_readback" | "admit_sink_bound_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ManifestationSinkBindingVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function sinkMismatches(input: ManifestationSinkBindingInput): string[] {
  const { sink, candidate } = input;
  return [
    ...(candidate.repository !== sink.repository
      ? [`candidate repository ${candidate.repository} does not match sink ${sink.repository}`]
      : []),
    ...(candidate.pr_number !== sink.pr_number
      ? [`candidate PR #${candidate.pr_number} does not match sink PR #${sink.pr_number}`]
      : []),
    ...(candidate.branch !== sink.branch ? [`candidate branch ${candidate.branch} does not match sink branch ${sink.branch}`] : []),
  ];
}

function embodimentBlockers(candidate: ManifestationSinkCandidate): string[] {
  const blockers: string[] = [];

  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("sink-bound embodiment changes no executable platform file");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("sink-bound embodiment has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("sink-bound embodiment has no future-routing artifact evidence");
  }
  if (candidate.proof_artifacts.length === 0) {
    blockers.push("sink-bound embodiment has no proof artifact evidence");
  }

  return blockers;
}

export function bindManifestationSink(input: ManifestationSinkBindingInput): ManifestationSinkBindingVerdict {
  const candidate = input.candidate;
  const mismatches = sinkMismatches(input);
  if (mismatches.length > 0) {
    return block(
      input,
      "block_sink_mismatch",
      mismatches,
      "route the act back to the active GitHub PR sink before counting manifestation progress",
    );
  }

  if (candidate.base_head_sha !== input.sink.live_head_sha) {
    return block(
      input,
      "block_stale_head",
      [`candidate base ${candidate.base_head_sha} is not live sink head ${input.sink.live_head_sha}`],
      "rebase the candidate to the live PR head; preserve older heads only as historical context",
      [`live sink head ${input.sink.live_head_sha}`],
    );
  }

  if (NON_PROGRESS_MOVE_CLASSES.has(candidate.move_class) || input.prohibited_move_classes.includes(candidate.move_class)) {
    return block(
      input,
      "block_non_progress_move",
      [`manifestation sink cannot count move class as progress: ${candidate.move_class}`],
      "choose sink-bound embodiment, live-head status readback, or one exact external blocker",
      [candidate.move_class],
    );
  }

  if (candidate.move_class === "external_platform_embodiment") {
    const blockers = embodimentBlockers(candidate);
    if (blockers.length > 0) {
      return block(
        input,
        "block_incomplete_evidence",
        blockers,
        "supply executable, routing, and proof evidence before moving the sink branch",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_sink_bound_embodiment",
      decisive_evidence: [
        `${input.sink.repository}#${input.sink.pr_number}`,
        input.sink.branch,
        input.sink.live_head_sha,
        ...candidate.changed_files.filter(executablePlatformPath),
        ...candidate.executable_artifacts,
        ...candidate.routing_artifacts,
        ...candidate.proof_artifacts,
      ],
      blockers: [],
      next_route: "commit the sink-bound embodiment, then read checks only for the moved PR head",
    };
  }

  if (candidate.move_class === "fresh_status_readback") {
    if (candidate.status_surface_ids.length === 0) {
      return block(
        input,
        "block_incomplete_evidence",
        ["sink-bound status readback has no live-head status surface id"],
        "obtain Checks, Actions, or workflow-published status evidence for the live sink head",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "admit_sink_bound_status_readback",
      decisive_evidence: [
        `${input.sink.repository}#${input.sink.pr_number}`,
        input.sink.live_head_sha,
        ...candidate.status_surface_ids,
      ],
      blockers: [],
      next_route: "publish only this live-head status surface, then choose a non-repeated embodiment",
    };
  }

  const blocker = candidate.blocker?.trim();
  if (!blocker) {
    return block(
      input,
      "block_missing_blocker",
      ["sink-bound exact blocker candidate has no blocker text"],
      "name the exact external blocker for the active PR sink or choose embodiment/readback",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_sink_bound_blocker",
    decisive_evidence: [`${input.sink.repository}#${input.sink.pr_number}`, input.sink.live_head_sha, blocker],
    blockers: [blocker],
    next_route: "remove the named sink-bound blocker before claiming another progress class",
  };
}
