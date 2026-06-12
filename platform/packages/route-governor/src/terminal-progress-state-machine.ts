export type TerminalProgressEventKind =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker";

export type TerminalProgressCursorState = "needs_live_status" | "status_satisfied" | "blocked";

export type TerminalProgressNextRoute =
  | "read_live_head_status"
  | "select_next_external_embodiment"
  | "remove_exact_external_blocker"
  | "block_terminal_progress_state";

export interface TerminalProgressEvent {
  event_id: string;
  branch: string;
  head_sha: string;
  kind: TerminalProgressEventKind;
  artifact_class?: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  status_surface_ids: string[];
  blocker?: string;
}

export interface TerminalProgressStateMachineInput {
  active_branch: string;
  live_head_sha: string;
  prompt_head_sha: string;
  previous_status_head_sha: string;
  resolved_historical_heads: string[];
  events: TerminalProgressEvent[];
}

export interface TerminalProgressStateMachineVerdict {
  ok: boolean;
  branch: string;
  head_sha: string;
  cursor_state: TerminalProgressCursorState;
  required_status_head_sha: string | null;
  quarantined_prompt_head_sha: string | null;
  spent_event_ids: string[];
  spent_artifact_classes: string[];
  prohibited_next_progress_classes: TerminalProgressEventKind[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: TerminalProgressNextRoute;
}

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function embodimentBlockers(event: TerminalProgressEvent, spentArtifactClasses: string[]): string[] {
  const blockers: string[] = [];
  const artifactClass = event.artifact_class?.trim() ?? "";

  if (!artifactClass) blockers.push("terminal embodiment event has no artifact class");
  if (artifactClass && spentArtifactClasses.includes(artifactClass)) {
    blockers.push(`terminal embodiment repeats spent artifact class: ${artifactClass}`);
  }
  if (!event.changed_files.some(executablePlatformPath)) {
    blockers.push("terminal embodiment changes no executable platform file");
  }
  if (event.executable_artifacts.length === 0) blockers.push("terminal embodiment has no executable artifact evidence");
  if (event.routing_artifacts.length === 0) blockers.push("terminal embodiment has no future-routing artifact evidence");
  if (event.proof_artifacts.length === 0) blockers.push("terminal embodiment has no proof artifact evidence");

  return blockers;
}

function baseVerdict(
  input: TerminalProgressStateMachineInput,
  cursorState: TerminalProgressCursorState,
  requiredStatusHeadSha: string | null,
  spentEventIds: string[],
  spentArtifactClasses: string[],
  decisiveEvidence: string[],
  blockers: string[],
  nextRoute: TerminalProgressNextRoute,
): TerminalProgressStateMachineVerdict {
  return {
    ok: blockers.length === 0,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    cursor_state: cursorState,
    required_status_head_sha: requiredStatusHeadSha,
    quarantined_prompt_head_sha: input.prompt_head_sha === input.live_head_sha ? null : input.prompt_head_sha,
    spent_event_ids: unique(spentEventIds),
    spent_artifact_classes: unique(spentArtifactClasses),
    prohibited_next_progress_classes:
      blockers.length > 0 || cursorState === "needs_live_status" ? ["external_platform_embodiment"] : ["fresh_status_readback"],
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

export function reduceTerminalProgressState(
  input: TerminalProgressStateMachineInput,
): TerminalProgressStateMachineVerdict {
  const blockers: string[] = [];
  const decisiveEvidence: string[] = [];
  const spentEventIds: string[] = [];
  const spentArtifactClasses: string[] = [];
  const seenEventIds = new Set<string>();
  const resolvedHistoricalHeads = new Set(input.resolved_historical_heads);
  let cursorState: TerminalProgressCursorState =
    input.previous_status_head_sha === input.live_head_sha ? "status_satisfied" : "needs_live_status";
  let requiredStatusHeadSha: string | null = cursorState === "needs_live_status" ? input.live_head_sha : null;

  for (const event of input.events) {
    if (!event.event_id.trim()) blockers.push("terminal progress event has no event id");
    if (seenEventIds.has(event.event_id)) blockers.push(`terminal progress event replayed: ${event.event_id}`);
    seenEventIds.add(event.event_id);

    if (event.branch !== input.active_branch) {
      blockers.push(`terminal progress event ${event.event_id} targets branch ${event.branch}, not ${input.active_branch}`);
    }

    if (event.head_sha !== input.live_head_sha) {
      const historical = resolvedHistoricalHeads.has(event.head_sha) ? "resolved historical" : "stale";
      blockers.push(`terminal progress event ${event.event_id} is bound to ${historical} head ${event.head_sha}, not live head ${input.live_head_sha}`);
    }

    if (event.kind === "external_platform_embodiment") {
      blockers.push(...embodimentBlockers(event, spentArtifactClasses));
      if (event.artifact_class?.trim()) spentArtifactClasses.push(event.artifact_class);
      cursorState = "needs_live_status";
      requiredStatusHeadSha = input.live_head_sha;
      decisiveEvidence.push(event.event_id, event.kind, ...(event.artifact_class ? [event.artifact_class] : []));
    }

    if (event.kind === "fresh_status_readback") {
      if (event.status_surface_ids.length === 0) {
        blockers.push(`terminal status readback ${event.event_id} has no status surface id`);
      }
      cursorState = "status_satisfied";
      requiredStatusHeadSha = null;
      decisiveEvidence.push(event.event_id, ...event.status_surface_ids);
    }

    if (event.kind === "exact_external_blocker") {
      if (!event.blocker?.trim()) blockers.push(`terminal blocker event ${event.event_id} has no exact blocker text`);
      cursorState = "blocked";
      requiredStatusHeadSha = null;
      decisiveEvidence.push(event.event_id, ...(event.blocker ? [event.blocker] : []));
    }

    spentEventIds.push(event.event_id);
  }

  if (blockers.length > 0) {
    return baseVerdict(
      input,
      "blocked",
      null,
      spentEventIds,
      spentArtifactClasses,
      decisiveEvidence,
      blockers,
      "block_terminal_progress_state",
    );
  }

  if (cursorState === "blocked") {
    return baseVerdict(
      input,
      cursorState,
      requiredStatusHeadSha,
      spentEventIds,
      spentArtifactClasses,
      decisiveEvidence,
      ["terminal progress is held by an exact external blocker"],
      "remove_exact_external_blocker",
    );
  }

  if (cursorState === "needs_live_status") {
    return baseVerdict(
      input,
      cursorState,
      requiredStatusHeadSha,
      spentEventIds,
      spentArtifactClasses,
      decisiveEvidence.length > 0
        ? decisiveEvidence
        : [`head moved from ${input.previous_status_head_sha} to ${input.live_head_sha}`],
      [],
      "read_live_head_status",
    );
  }

  return baseVerdict(
    input,
    cursorState,
    null,
    spentEventIds,
    spentArtifactClasses,
    decisiveEvidence.length > 0 ? decisiveEvidence : [`live-head status already satisfied for ${input.live_head_sha}`],
    [],
    "select_next_external_embodiment",
  );
}
