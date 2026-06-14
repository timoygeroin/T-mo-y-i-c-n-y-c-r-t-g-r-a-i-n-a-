export type FinalizationReleaseClass =
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

export type FinalizationReleaseSideEffect =
  | "pr_comment"
  | "pr_label"
  | "issue_comment"
  | "issue_close"
  | "memory_update"
  | "status_claim"
  | "branch_commit";

export type FinalizationReleaseMuxAction =
  | "release_external_embodiment"
  | "release_fresh_status_readback"
  | "release_exact_external_blocker"
  | "block_non_progress_release"
  | "block_bundled_release"
  | "block_stale_base_head"
  | "block_stale_status_authority"
  | "block_incomplete_embodiment"
  | "block_missing_exact_blocker";

export interface FinalizationReleaseCandidate {
  release_id: string;
  release_class: FinalizationReleaseClass;
  branch: string;
  base_head_sha: string;
  resulting_head_sha?: string;
  status_head_sha?: string;
  side_effects: FinalizationReleaseSideEffect[];
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
}

export interface FinalizationReleaseMuxInput {
  active_branch: string;
  live_head_sha: string;
  previous_status_head_sha: string;
  resolved_historical_heads: string[];
  prohibited_release_classes: FinalizationReleaseClass[];
  spent_release_ids: string[];
  candidate: FinalizationReleaseCandidate;
}

export interface FinalizationReleaseMuxVerdict {
  ok: boolean;
  action: FinalizationReleaseMuxAction;
  branch: string;
  head_sha: string;
  resulting_head_sha: string | null;
  release_id: string | null;
  quarantined_head_shas: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_RELEASES = new Set<FinalizationReleaseClass>([
  "pr_metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "duplicate_label",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_resolved_blocker",
]);

const SIDE_EFFECTS_ALLOWED_BY_CLASS: Record<
  "external_platform_embodiment" | "fresh_status_readback" | "exact_external_blocker",
  Set<FinalizationReleaseSideEffect>
> = {
  external_platform_embodiment: new Set(["branch_commit"]),
  fresh_status_readback: new Set(["status_claim"]),
  exact_external_blocker: new Set([]),
};

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorFile(path: string): boolean {
  return executablePlatformPath(path) && !/(?:\.test|-proof)\.ts$/.test(path);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function base(input: FinalizationReleaseMuxInput): Pick<
  FinalizationReleaseMuxVerdict,
  "branch" | "head_sha" | "resulting_head_sha" | "release_id" | "quarantined_head_shas"
> {
  const quarantined = new Set(input.resolved_historical_heads.filter((head) => head !== input.live_head_sha));
  if (input.previous_status_head_sha !== input.live_head_sha) quarantined.add(input.previous_status_head_sha);
  if (input.candidate.base_head_sha !== input.live_head_sha) quarantined.add(input.candidate.base_head_sha);
  if (input.candidate.status_head_sha && input.candidate.status_head_sha !== input.live_head_sha) {
    quarantined.add(input.candidate.status_head_sha);
  }

  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    resulting_head_sha: input.candidate.resulting_head_sha ?? null,
    release_id: input.candidate.release_id || null,
    quarantined_head_shas: unique([...quarantined]),
  };
}

function block(
  input: FinalizationReleaseMuxInput,
  action: Exclude<
    FinalizationReleaseMuxAction,
    "release_external_embodiment" | "release_fresh_status_readback" | "release_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): FinalizationReleaseMuxVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function bundledSideEffects(candidate: FinalizationReleaseCandidate): string[] {
  if (
    candidate.release_class !== "external_platform_embodiment" &&
    candidate.release_class !== "fresh_status_readback" &&
    candidate.release_class !== "exact_external_blocker"
  ) {
    return candidate.side_effects;
  }

  const allowed = SIDE_EFFECTS_ALLOWED_BY_CLASS[candidate.release_class];
  return candidate.side_effects.filter((effect) => !allowed.has(effect));
}

function incompleteEmbodiment(candidate: FinalizationReleaseCandidate): string[] {
  const blockers: string[] = [];
  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("release embodiment changes no executable platform file");
  }
  if (!candidate.changed_files.some(behaviorFile)) {
    blockers.push("release embodiment has no behavior-bearing platform file");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("release embodiment has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("release embodiment has no future-routing artifact evidence");
  }
  if (candidate.proof_artifacts.length === 0) {
    blockers.push("release embodiment has no proof artifact evidence");
  }
  return blockers;
}

export function routeFinalizationReleaseMux(input: FinalizationReleaseMuxInput): FinalizationReleaseMuxVerdict {
  const candidate = input.candidate;

  if (candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_stale_base_head",
      [`candidate branch ${candidate.branch} does not match active branch ${input.active_branch}`],
      "bind the release candidate to the active manifestation branch before release",
    );
  }

  if (!candidate.release_id.trim()) {
    return block(
      input,
      "block_non_progress_release",
      ["release candidate has no release id"],
      "supply a durable release id before publishing terminal progress",
    );
  }

  if (input.spent_release_ids.includes(candidate.release_id)) {
    return block(
      input,
      "block_non_progress_release",
      [`release id already spent: ${candidate.release_id}`],
      "choose a new terminal release id for the new head movement or blocker",
    );
  }

  if (input.prohibited_release_classes.includes(candidate.release_class) || NON_PROGRESS_RELEASES.has(candidate.release_class)) {
    return block(
      input,
      "block_non_progress_release",
      [`release class is not terminal progress: ${candidate.release_class}`],
      "release exactly one external embodiment, fresh live-head status readback, or exact external blocker",
      [candidate.release_class],
    );
  }

  const extraEffects = bundledSideEffects(candidate);
  if (extraEffects.length > 0) {
    return block(
      input,
      "block_bundled_release",
      extraEffects.map((effect) => `side effect cannot ride this release class: ${effect}`),
      "split side effects away; one release may carry only its admitted terminal operation",
      [candidate.release_class, ...candidate.side_effects],
    );
  }

  if (candidate.release_class === "external_platform_embodiment") {
    if (candidate.base_head_sha !== input.live_head_sha) {
      return block(
        input,
        "block_stale_base_head",
        [`embodiment base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
        "rebase the embodiment to the live PR head before writing",
      );
    }

    const blockers = incompleteEmbodiment(candidate);
    if (blockers.length > 0) {
      return block(
        input,
        "block_incomplete_embodiment",
        blockers,
        "supply behavior-bearing executable, routing, and proof evidence before release",
      );
    }

    if (candidate.resulting_head_sha && candidate.resulting_head_sha === input.live_head_sha) {
      return block(
        input,
        "block_incomplete_embodiment",
        [`resulting head ${candidate.resulting_head_sha} does not move beyond live head ${input.live_head_sha}`],
        "write the embodiment and bind release receipt to the moved head",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "release_external_embodiment",
      decisive_evidence: [
        candidate.release_id,
        `base ${input.live_head_sha}`,
        ...candidate.changed_files.filter(executablePlatformPath),
        ...candidate.executable_artifacts,
        ...candidate.routing_artifacts,
        ...candidate.proof_artifacts,
      ],
      blockers: [],
      next_route: "after the branch moves, bind the next status readback to the resulting head only",
    };
  }

  if (candidate.release_class === "fresh_status_readback") {
    if (candidate.base_head_sha !== input.live_head_sha) {
      return block(
        input,
        "block_stale_base_head",
        [`status readback base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
        "read status only for the live PR head",
      );
    }

    if (candidate.status_head_sha !== input.live_head_sha) {
      return block(
        input,
        "block_stale_status_authority",
        [`status head ${candidate.status_head_sha ?? "<none>"} is not live head ${input.live_head_sha}`],
        "discard stale repaired-head status and obtain a live-head status surface",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "release_fresh_status_readback",
      decisive_evidence: [candidate.release_id, `status head ${input.live_head_sha}`],
      blockers: [],
      next_route: "choose the next non-repeated embodiment or exact blocker from this live-head status result",
    };
  }

  const blocker = candidate.blocker?.trim();
  if (!blocker) {
    return block(
      input,
      "block_missing_exact_blocker",
      ["exact external blocker release has no blocker text"],
      "name one exact external blocker or choose embodiment/status readback",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "release_exact_external_blocker",
    decisive_evidence: [candidate.release_id, blocker, `live head ${input.live_head_sha}`],
    blockers: [blocker],
    next_route: "remove the named blocker before attempting another terminal release class",
  };
}
