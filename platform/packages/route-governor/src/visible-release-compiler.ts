export type VisibleReleaseKind = "external_platform_embodiment" | "fresh_status_readback" | "exact_external_blocker";

export type VisibleReleaseForbiddenClass =
  | "repaired_head_status_blocker"
  | "duplicate_ci_summary"
  | "metadata_reread"
  | "duplicate_comment"
  | "duplicate_label"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_resolved_blocker";

export type VisibleReleaseAction =
  | "compile_visible_external_embodiment_release"
  | "compile_visible_status_readback_release"
  | "compile_visible_exact_blocker_release"
  | "block_visible_release";

export interface VisibleReleaseEvidence {
  previous_head_sha: string;
  resulting_head_sha?: string;
  status_head_sha?: string;
  changed_files: string[];
  behavior_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  blocker?: string;
}

export interface VisibleReleaseCompilerInput {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  active_branch: string;
  live_head_sha: string;
  release_kind: VisibleReleaseKind;
  release_id: string;
  spent_release_ids: string[];
  forbidden_classes: VisibleReleaseForbiddenClass[];
  evidence: VisibleReleaseEvidence;
}

export interface VisibleReleaseCompilerVerdict {
  ok: boolean;
  action: VisibleReleaseAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  release_id: string | null;
  visible_lines: string[];
  decisive_evidence: string[];
  blockers: string[];
  quarantined_heads: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorPath(path: string): boolean {
  return executablePlatformPath(path) && !/(?:\.test|-proof)\.ts$/.test(path);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function base(input: VisibleReleaseCompilerInput): Pick<
  VisibleReleaseCompilerVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "release_id" | "quarantined_heads"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    release_id: input.release_id.trim() || null,
    quarantined_heads: unique([
      input.evidence.previous_head_sha === input.live_head_sha ? "" : input.evidence.previous_head_sha,
      input.evidence.status_head_sha && input.evidence.status_head_sha !== input.live_head_sha ? input.evidence.status_head_sha : "",
      input.evidence.resulting_head_sha && input.evidence.resulting_head_sha !== input.live_head_sha
        ? input.evidence.resulting_head_sha
        : "",
    ]),
  };
}

function block(
  input: VisibleReleaseCompilerInput,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): VisibleReleaseCompilerVerdict {
  return {
    ...base(input),
    ok: false,
    action: "block_visible_release",
    visible_lines: [],
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(input: VisibleReleaseCompilerInput): string[] {
  const evidence = input.evidence;
  const blockers: string[] = [];

  if (evidence.previous_head_sha !== input.live_head_sha) {
    blockers.push(`visible embodiment base ${evidence.previous_head_sha} is not live head ${input.live_head_sha}`);
  }
  if (!evidence.resulting_head_sha) {
    blockers.push("visible embodiment release has no resulting head");
  }
  if (evidence.resulting_head_sha === input.live_head_sha) {
    blockers.push(`visible embodiment resulting head ${evidence.resulting_head_sha} does not move beyond live head`);
  }
  if (!evidence.changed_files.some(executablePlatformPath)) {
    blockers.push("visible embodiment release changes no executable platform file");
  }
  if (!evidence.changed_files.some(behaviorPath)) {
    blockers.push("visible embodiment release has no behavior-bearing platform file");
  }
  if (evidence.behavior_artifacts.length === 0) blockers.push("visible embodiment release has no behavior artifact");
  if (evidence.routing_artifacts.length === 0) blockers.push("visible embodiment release has no routing artifact");
  if (evidence.proof_artifacts.length === 0) blockers.push("visible embodiment release has no proof artifact");

  return blockers;
}

export function compileVisibleRelease(input: VisibleReleaseCompilerInput): VisibleReleaseCompilerVerdict {
  const releaseId = input.release_id.trim();

  if (input.branch !== input.active_branch) {
    return block(
      input,
      [`visible release branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind the visible release to the active manifestation branch before speaking",
    );
  }

  if (!releaseId) {
    return block(input, ["visible release has no release id"], "supply a durable release id before release");
  }

  if (input.spent_release_ids.includes(releaseId)) {
    return block(input, [`visible release id already spent: ${releaseId}`], "choose an unspent release id");
  }

  if (input.forbidden_classes.length > 0) {
    return block(
      input,
      input.forbidden_classes.map((klass) => `visible release contains forbidden class: ${klass}`),
      "remove non-progress classes from the visible release before emitting it",
      input.forbidden_classes,
    );
  }

  if (input.release_kind === "external_platform_embodiment") {
    const blockers = embodimentBlockers(input);
    if (blockers.length > 0) {
      return block(
        input,
        blockers,
        "compile a visible embodiment release only after the branch moves with behavior, routing, and proof evidence",
      );
    }

    const resultingHead = input.evidence.resulting_head_sha as string;
    return {
      ...base(input),
      ok: true,
      action: "compile_visible_external_embodiment_release",
      head_sha: resultingHead,
      visible_lines: [
        `External embodiment committed on ${input.active_branch}: ${resultingHead}.`,
        `Behavior: ${input.evidence.behavior_artifacts.join(", ")}.`,
        `Next route: read status only for ${resultingHead} before any status claim.`,
      ],
      decisive_evidence: [
        releaseId,
        `base ${input.live_head_sha}`,
        `resulting head ${resultingHead}`,
        ...input.evidence.changed_files.filter(executablePlatformPath),
        ...input.evidence.behavior_artifacts,
        ...input.evidence.routing_artifacts,
        ...input.evidence.proof_artifacts,
      ],
      blockers: [],
      quarantined_heads: unique([input.evidence.previous_head_sha === input.live_head_sha ? "" : input.evidence.previous_head_sha]),
      next_route: "after release, status authority belongs only to the moved head",
    };
  }

  if (input.release_kind === "fresh_status_readback") {
    if (input.evidence.status_head_sha !== input.live_head_sha) {
      return block(
        input,
        [`visible status release head ${input.evidence.status_head_sha ?? "<none>"} is not live head ${input.live_head_sha}`],
        "discard stale status summaries and read the live PR head",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "compile_visible_status_readback_release",
      visible_lines: [`Fresh status readback is bound to live head ${input.live_head_sha}.`],
      decisive_evidence: [releaseId, `status head ${input.live_head_sha}`],
      blockers: [],
      next_route: "choose a non-repeated embodiment or exact blocker from the live status result",
    };
  }

  const blocker = input.evidence.blocker?.trim();
  if (!blocker) {
    return block(input, ["visible exact-blocker release has no blocker text"], "name one exact blocker or choose another release kind");
  }

  return {
    ...base(input),
    ok: true,
    action: "compile_visible_exact_blocker_release",
    visible_lines: [blocker],
    decisive_evidence: [releaseId, blocker, `live head ${input.live_head_sha}`],
    blockers: [blocker],
    next_route: "remove the named blocker before another visible release",
  };
}
