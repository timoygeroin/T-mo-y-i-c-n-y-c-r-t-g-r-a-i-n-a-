export type ActiveSinkMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "pr_metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_completed_blocker"
  | "stale_repaired_head_readback";

export type ActiveSinkAction =
  | "commit_external_embodiment"
  | "read_current_head_status"
  | "emit_exact_blocker"
  | "block_release";

export interface ActiveManifestationSink {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  current_head_sha: string;
  repaired_head_sha: string;
  last_status_readback_head_sha: string;
}

export interface ActiveSinkTarget {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
}

export interface ActiveSinkCandidate {
  candidate_id: string;
  move_class: ActiveSinkMoveClass;
  target: ActiveSinkTarget;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  new_check_run_ids: string[];
  blocker?: string;
}

export interface ActiveSinkCandidateVerdict {
  ok: boolean;
  action: ActiveSinkAction;
  candidate_id: string;
  decisive_evidence: string[];
  failures: string[];
}

export interface ActiveSinkSelectionVerdict {
  ok: boolean;
  action: ActiveSinkAction;
  selected_candidate_id: string | null;
  decisive_evidence: string[];
  rejected: ActiveSinkCandidateVerdict[];
  failures: string[];
}

const NON_PROGRESS_MOVE_CLASSES = new Set<ActiveSinkMoveClass>([
  "pr_metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_completed_blocker",
  "stale_repaired_head_readback",
]);

function isExecutablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function priority(action: ActiveSinkAction): number {
  switch (action) {
    case "commit_external_embodiment":
      return 3;
    case "read_current_head_status":
      return 2;
    case "emit_exact_blocker":
      return 1;
    case "block_release":
      return 0;
  }
}

function targetFailures(sink: ActiveManifestationSink, candidate: ActiveSinkCandidate): string[] {
  const failures: string[] = [];
  const { target } = candidate;

  if (target.repository_full_name !== sink.repository_full_name) {
    failures.push(`candidate targets wrong repository: ${target.repository_full_name}`);
  }
  if (target.pr_number !== sink.pr_number) {
    failures.push(`candidate targets wrong PR: ${target.pr_number}`);
  }
  if (target.branch !== sink.branch) {
    failures.push(`candidate targets wrong branch: ${target.branch}`);
  }
  if (target.head_sha !== sink.current_head_sha) {
    failures.push(`candidate targets stale or mismatched head: ${target.head_sha}`);
  }

  return failures;
}

export function evaluateActiveSinkCandidate(
  sink: ActiveManifestationSink,
  candidate: ActiveSinkCandidate,
): ActiveSinkCandidateVerdict {
  const failures = targetFailures(sink, candidate);
  const headMovedSinceReadback = sink.current_head_sha !== sink.last_status_readback_head_sha;
  const hasNewChecks = candidate.new_check_run_ids.length > 0;
  const hasExecutableChange = candidate.changed_files.some(isExecutablePlatformPath);

  if (NON_PROGRESS_MOVE_CLASSES.has(candidate.move_class)) {
    failures.push(`move class is explicitly non-progress: ${candidate.move_class}`);
  }

  if (candidate.move_class === "fresh_status_readback") {
    if (sink.current_head_sha === sink.repaired_head_sha && sink.last_status_readback_head_sha === sink.repaired_head_sha) {
      failures.push("stale repaired-head readback is exhausted");
    }
    if (!headMovedSinceReadback && !hasNewChecks) {
      failures.push("fresh status readback requires the PR head to move or new check runs to appear");
    }
  }

  if (candidate.move_class === "external_platform_embodiment") {
    if (!hasExecutableChange) {
      failures.push("external embodiment must change executable platform files");
    }
    if (candidate.executable_artifacts.length === 0) {
      failures.push("external embodiment has no executable artifact");
    }
    if (candidate.routing_artifacts.length === 0) {
      failures.push("external embodiment has no future-routing artifact");
    }
  }

  if (candidate.move_class === "exact_external_blocker" && !candidate.blocker?.trim()) {
    failures.push("exact blocker move must name the blocker");
  }

  if (failures.length > 0) {
    return {
      ok: false,
      action: "block_release",
      candidate_id: candidate.candidate_id,
      decisive_evidence: [],
      failures,
    };
  }

  if (candidate.move_class === "external_platform_embodiment") {
    return {
      ok: true,
      action: "commit_external_embodiment",
      candidate_id: candidate.candidate_id,
      decisive_evidence: [...candidate.changed_files, ...candidate.executable_artifacts, ...candidate.routing_artifacts],
      failures: [],
    };
  }

  if (candidate.move_class === "fresh_status_readback") {
    return {
      ok: true,
      action: "read_current_head_status",
      candidate_id: candidate.candidate_id,
      decisive_evidence: [
        ...(headMovedSinceReadback
          ? [`head moved from ${sink.last_status_readback_head_sha} to ${sink.current_head_sha}`]
          : []),
        ...candidate.new_check_run_ids.map((id) => `new check run ${id}`),
      ],
      failures: [],
    };
  }

  return {
    ok: true,
    action: "emit_exact_blocker",
    candidate_id: candidate.candidate_id,
    decisive_evidence: [candidate.blocker ?? "exact external blocker supplied"],
    failures: [],
  };
}

export function selectActiveSinkContinuation(
  sink: ActiveManifestationSink,
  candidates: ActiveSinkCandidate[],
): ActiveSinkSelectionVerdict {
  const verdicts = candidates.map((candidate) => evaluateActiveSinkCandidate(sink, candidate));
  const rejected = verdicts.filter((verdict) => !verdict.ok);
  const selectable = verdicts.filter((verdict) => verdict.ok).sort((left, right) => priority(right.action) - priority(left.action));
  const selected = selectable[0] ?? null;

  if (!selected) {
    return {
      ok: false,
      action: "block_release",
      selected_candidate_id: null,
      decisive_evidence: [],
      rejected,
      failures: ["no active-sink continuation candidate survived"],
    };
  }

  return {
    ok: true,
    action: selected.action,
    selected_candidate_id: selected.candidate_id,
    decisive_evidence: selected.decisive_evidence,
    rejected,
    failures: [],
  };
}
