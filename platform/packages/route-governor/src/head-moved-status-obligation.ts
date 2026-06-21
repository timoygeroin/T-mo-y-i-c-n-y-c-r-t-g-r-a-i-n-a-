export type HeadMovedObservationKind =
  | "live_pr_metadata"
  | "direct_status_surface"
  | "scheduled_prompt"
  | "pr_body_summary"
  | "memory_receipt";

export type HeadMovedStatusVerdict = "success" | "warning_only" | "failure" | "pending" | "unknown";

export type HeadMovedReleaseClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "repaired_head_blocker";

export type HeadMovedStatusObligationAction =
  | "open_moved_head_status_obligation"
  | "admit_direct_live_head_status"
  | "admit_obligated_external_embodiment"
  | "emit_exact_external_blocker"
  | "block_branch_mismatch"
  | "block_metadata_as_progress"
  | "block_stale_status_surface"
  | "block_repaired_head_reuse"
  | "block_incomplete_obligated_embodiment"
  | "block_missing_exact_blocker";

export interface HeadMovedObservation {
  surface_id: string;
  kind: HeadMovedObservationKind;
  branch: string;
  head_sha?: string;
  status_verdict?: HeadMovedStatusVerdict;
  evidence: string[];
}

export interface HeadMovedEmbodimentCandidate {
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  behavior_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  opens_post_write_status_escrow: boolean;
  expected_result_head_sha?: string;
}

export interface HeadMovedStatusObligationInput {
  active_branch: string;
  prompt_head_sha: string;
  live_head_sha: string;
  last_status_readback_head_sha?: string;
  repaired_historical_heads: string[];
  release_class: HeadMovedReleaseClass;
  observations: HeadMovedObservation[];
  embodiment_candidate?: HeadMovedEmbodimentCandidate;
  exact_blocker?: string;
}

export interface HeadMovedStatusObligationVerdict {
  ok: boolean;
  action: HeadMovedStatusObligationAction;
  branch: string;
  live_head_sha: string;
  status_obligation_head_sha: string | null;
  accepted_surface_ids: string[];
  stale_surface_ids: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const NON_PROGRESS_RELEASES = new Set<HeadMovedReleaseClass>(["metadata_reread", "duplicate_ci_summary"]);

function executableBehaviorPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(?:ts|js|mjs)$/.test(path) && !/(?:\.test|-proof)\.ts$/.test(path);
}

function directLiveStatus(input: HeadMovedStatusObligationInput): HeadMovedObservation[] {
  return input.observations.filter(
    (surface) =>
      surface.kind === "direct_status_surface" &&
      surface.branch === input.active_branch &&
      surface.head_sha === input.live_head_sha,
  );
}

function staleSurfaces(input: HeadMovedStatusObligationInput): HeadMovedObservation[] {
  return input.observations.filter(
    (surface) => Boolean(surface.head_sha) && surface.head_sha !== input.live_head_sha,
  );
}

function acceptedSurfaceIds(input: HeadMovedStatusObligationInput): string[] {
  return directLiveStatus(input).map((surface) => surface.surface_id);
}

function staleSurfaceIds(input: HeadMovedStatusObligationInput): string[] {
  return staleSurfaces(input).map((surface) => surface.surface_id);
}

function base(input: HeadMovedStatusObligationInput): Pick<
  HeadMovedStatusObligationVerdict,
  "branch" | "live_head_sha" | "accepted_surface_ids" | "stale_surface_ids"
> {
  return {
    branch: input.active_branch,
    live_head_sha: input.live_head_sha,
    accepted_surface_ids: acceptedSurfaceIds(input),
    stale_surface_ids: staleSurfaceIds(input),
  };
}

function headMovedSinceLastStatus(input: HeadMovedStatusObligationInput): boolean {
  return input.live_head_sha !== (input.last_status_readback_head_sha ?? input.prompt_head_sha);
}

function block(
  input: HeadMovedStatusObligationInput,
  action: Exclude<
    HeadMovedStatusObligationAction,
    | "open_moved_head_status_obligation"
    | "admit_direct_live_head_status"
    | "admit_obligated_external_embodiment"
    | "emit_exact_external_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): HeadMovedStatusObligationVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    status_obligation_head_sha: headMovedSinceLastStatus(input) ? input.live_head_sha : null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function embodimentBlockers(input: HeadMovedStatusObligationInput): string[] {
  const candidate = input.embodiment_candidate;
  const blockers: string[] = [];

  if (!candidate) return ["moved-head embodiment obligation has no embodiment candidate"];
  if (candidate.branch !== input.active_branch) blockers.push(`embodiment branch ${candidate.branch} is not ${input.active_branch}`);
  if (candidate.base_head_sha !== input.live_head_sha) {
    blockers.push(`embodiment base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`);
  }
  if (input.repaired_historical_heads.includes(candidate.base_head_sha)) {
    blockers.push(`embodiment base ${candidate.base_head_sha} is a repaired historical head`);
  }
  if (!candidate.changed_files.some(executableBehaviorPath)) {
    blockers.push("moved-head embodiment changes no behavior-bearing platform file");
  }
  if (candidate.behavior_artifacts.length === 0) blockers.push("moved-head embodiment has no behavior artifact");
  if (candidate.routing_artifacts.length === 0) blockers.push("moved-head embodiment has no future-routing artifact");
  if (candidate.proof_artifacts.length === 0) blockers.push("moved-head embodiment has no proof artifact");
  if (!candidate.opens_post_write_status_escrow) {
    blockers.push("moved-head embodiment must open post-write status escrow for the resulting head");
  }
  if (candidate.expected_result_head_sha && candidate.expected_result_head_sha === input.live_head_sha) {
    blockers.push("moved-head embodiment expected result must advance beyond the live head");
  }

  return blockers;
}

export function routeHeadMovedStatusObligation(
  input: HeadMovedStatusObligationInput,
): HeadMovedStatusObligationVerdict {
  const staleStatus = staleSurfaces(input).find((surface) => surface.kind === "direct_status_surface");
  if (staleStatus) {
    return block(
      input,
      "block_stale_status_surface",
      [`status surface ${staleStatus.surface_id} belongs to ${staleStatus.head_sha}, not live head ${input.live_head_sha}`],
      "discard stale status and bind the next readback or embodiment obligation to the live head",
      [staleStatus.surface_id, ...staleStatus.evidence],
    );
  }

  if (input.release_class === "repaired_head_blocker") {
    return block(
      input,
      "block_repaired_head_reuse",
      [`repaired-head blocker cannot be replayed after live head advanced to ${input.live_head_sha}`],
      "preserve repaired heads as history and route from the live head only",
      input.repaired_historical_heads,
    );
  }

  if (NON_PROGRESS_RELEASES.has(input.release_class)) {
    return block(
      input,
      "block_metadata_as_progress",
      [`${input.release_class} cannot satisfy moved-head status obligation`],
      "use metadata only to open the obligation; satisfy it with direct live-head status or obligated embodiment",
    );
  }

  const liveStatus = directLiveStatus(input);
  if (input.release_class === "fresh_status_readback" && liveStatus.length > 0) {
    return {
      ...base(input),
      ok: true,
      action: "admit_direct_live_head_status",
      status_obligation_head_sha: null,
      decisive_evidence: liveStatus.flatMap((surface) => [surface.surface_id, ...surface.evidence]),
      blockers: [],
      next_route: "consume only this direct live-head status surface before repair, review, merge, or next embodiment",
    };
  }

  if (input.release_class === "exact_external_blocker") {
    const blocker = input.exact_blocker?.trim();
    if (!blocker) {
      return block(
        input,
        "block_missing_exact_blocker",
        ["moved-head exact-blocker release has no blocker text"],
        "name the exact external blocker for the live head or choose direct status/obligated embodiment",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "emit_exact_external_blocker",
      status_obligation_head_sha: input.live_head_sha,
      decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
      blockers: [blocker],
      next_route: "remove the named live-head blocker before consuming the moved-head obligation",
    };
  }

  if (input.release_class === "external_platform_embodiment") {
    const blockers = embodimentBlockers(input);
    if (blockers.length > 0) {
      return block(
        input,
        blockers.some((item) => item.includes("branch")) ? "block_branch_mismatch" : "block_incomplete_obligated_embodiment",
        blockers,
        "supply behavior, routing, proof, live-head base, and post-write status escrow before writing",
      );
    }

    const candidate = input.embodiment_candidate;
    if (!candidate) throw new Error("unreachable: candidate was checked above");

    return {
      ...base(input),
      ok: true,
      action: "admit_obligated_external_embodiment",
      status_obligation_head_sha: candidate.expected_result_head_sha ?? input.live_head_sha,
      decisive_evidence: [
        `live head ${input.live_head_sha}`,
        ...candidate.changed_files.filter(executableBehaviorPath),
        ...candidate.behavior_artifacts,
        ...candidate.routing_artifacts,
        ...candidate.proof_artifacts,
        "post-write status escrow required",
      ],
      blockers: [],
      next_route: "write the embodiment, then satisfy the status obligation on the resulting head before any status claim",
    };
  }

  if (headMovedSinceLastStatus(input)) {
    return {
      ...base(input),
      ok: true,
      action: "open_moved_head_status_obligation",
      status_obligation_head_sha: input.live_head_sha,
      decisive_evidence: [
        `prompt/status head ${input.last_status_readback_head_sha ?? input.prompt_head_sha}`,
        `live head ${input.live_head_sha}`,
      ],
      blockers: [],
      next_route: "obtain direct live-head status or commit an obligated embodiment that opens post-write status escrow",
    };
  }

  return block(
    input,
    "block_metadata_as_progress",
    ["no moved-head status delta is present"],
    "wait for a moved head, direct status surface, obligated embodiment, or exact external blocker",
  );
}
