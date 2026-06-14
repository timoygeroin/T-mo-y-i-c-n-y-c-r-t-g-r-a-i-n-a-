export type TerminalReleaseChainClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker";

export type TerminalReleaseChainAction =
  | "accept_terminal_chain_link"
  | "block_branch_mismatch"
  | "block_broken_previous_link"
  | "block_stale_candidate_base"
  | "block_replayed_release"
  | "block_incomplete_chain_link";

export interface AcceptedTerminalReleaseLink {
  release_id: string;
  release_class: TerminalReleaseChainClass;
  branch: string;
  base_head_sha: string;
  resulting_head_sha: string;
  evidence_fingerprint: string;
}

export interface CandidateTerminalReleaseLink {
  release_id: string;
  release_class: TerminalReleaseChainClass;
  branch: string;
  base_head_sha: string;
  resulting_head_sha?: string;
  evidence_fingerprint: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  status_surface_ids: string[];
  blocker?: string;
}

export interface TerminalReleaseChainInput {
  active_branch: string;
  live_head_sha: string;
  previous_release: AcceptedTerminalReleaseLink;
  spent_release_ids: string[];
  candidate: CandidateTerminalReleaseLink;
}

export interface TerminalReleaseChainVerdict {
  ok: boolean;
  action: TerminalReleaseChainAction;
  branch: string;
  live_head_sha: string;
  accepted_release_id: string | null;
  resulting_head_sha: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorBearingPlatformPath(path: string): boolean {
  return executablePlatformPath(path) && !/(?:\.test|-proof)\.ts$/.test(path);
}

function base(input: TerminalReleaseChainInput): Pick<
  TerminalReleaseChainVerdict,
  "branch" | "live_head_sha" | "accepted_release_id" | "resulting_head_sha"
> {
  return {
    branch: input.active_branch,
    live_head_sha: input.live_head_sha,
    accepted_release_id: null,
    resulting_head_sha: input.candidate.resulting_head_sha ?? null,
  };
}

function block(
  input: TerminalReleaseChainInput,
  action: Exclude<TerminalReleaseChainAction, "accept_terminal_chain_link">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): TerminalReleaseChainVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function sharedLinkBlockers(input: TerminalReleaseChainInput): string[] {
  const { candidate } = input;
  const blockers: string[] = [];

  if (!candidate.release_id.trim()) blockers.push("candidate terminal release has no release id");
  if (!candidate.evidence_fingerprint.trim()) blockers.push("candidate terminal release has no evidence fingerprint");
  if (input.spent_release_ids.includes(candidate.release_id)) {
    blockers.push(`terminal release id already spent: ${candidate.release_id}`);
  }
  if (candidate.release_id === input.previous_release.release_id) {
    blockers.push(`candidate repeats previous release id: ${candidate.release_id}`);
  }
  if (candidate.evidence_fingerprint === input.previous_release.evidence_fingerprint) {
    blockers.push("candidate repeats previous terminal release evidence fingerprint");
  }

  return blockers;
}

function classSpecificBlockers(candidate: CandidateTerminalReleaseLink, liveHead: string): string[] {
  const blockers: string[] = [];

  if (candidate.release_class === "external_platform_embodiment") {
    if (!candidate.resulting_head_sha) blockers.push("external embodiment has no resulting head sha");
    if (candidate.resulting_head_sha === liveHead) {
      blockers.push(`external embodiment resulting head does not move beyond live head ${liveHead}`);
    }
    if (!candidate.changed_files.some(behaviorBearingPlatformPath)) {
      blockers.push("external embodiment has no behavior-bearing platform file change");
    }
    if (candidate.executable_artifacts.length === 0) blockers.push("external embodiment has no executable artifact");
    if (candidate.routing_artifacts.length === 0) blockers.push("external embodiment has no future-routing artifact");
  }

  if (candidate.release_class === "fresh_status_readback") {
    if (candidate.status_surface_ids.length === 0) {
      blockers.push("fresh status readback has no status surface id");
    }
    if (candidate.resulting_head_sha && candidate.resulting_head_sha !== liveHead) {
      blockers.push("fresh status readback cannot claim a branch head movement");
    }
  }

  if (candidate.release_class === "exact_external_blocker") {
    if (!candidate.blocker?.trim()) blockers.push("exact external blocker link has no blocker text");
    if (candidate.resulting_head_sha && candidate.resulting_head_sha !== liveHead) {
      blockers.push("exact external blocker cannot claim a branch head movement");
    }
  }

  return blockers;
}

export function compileTerminalReleaseChain(input: TerminalReleaseChainInput): TerminalReleaseChainVerdict {
  const { candidate, previous_release: previous } = input;

  if (previous.branch !== input.active_branch || candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [
        `previous branch ${previous.branch} and candidate branch ${candidate.branch} must both match ${input.active_branch}`,
      ],
      "bind terminal release chain links to the active manifestation branch before release",
    );
  }

  if (previous.resulting_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_broken_previous_link",
      [`previous release ${previous.release_id} ends at ${previous.resulting_head_sha}, not live head ${input.live_head_sha}`],
      "repair the live-head cursor before admitting another terminal release",
      [previous.release_id, previous.resulting_head_sha],
    );
  }

  if (candidate.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_candidate_base",
      [`candidate base ${candidate.base_head_sha} is not live head ${input.live_head_sha}`],
      "rebase the candidate terminal release onto the live PR head",
      [candidate.release_id, candidate.base_head_sha],
    );
  }

  const sharedBlockers = sharedLinkBlockers(input);
  if (sharedBlockers.length > 0) {
    return block(
      input,
      "block_replayed_release",
      sharedBlockers,
      "supply a new terminal release id and a new evidence fingerprint before counting progress",
      [candidate.release_id, candidate.evidence_fingerprint],
    );
  }

  const specificBlockers = classSpecificBlockers(candidate, input.live_head_sha);
  if (specificBlockers.length > 0) {
    return block(
      input,
      "block_incomplete_chain_link",
      specificBlockers,
      "complete the class-specific terminal release evidence before extending the chain",
      [candidate.release_class],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_terminal_chain_link",
    accepted_release_id: candidate.release_id,
    resulting_head_sha: candidate.resulting_head_sha ?? input.live_head_sha,
    decisive_evidence: [
      previous.release_id,
      `previous-result:${previous.resulting_head_sha}`,
      candidate.release_id,
      candidate.release_class,
      candidate.evidence_fingerprint,
      ...candidate.changed_files.filter(executablePlatformPath),
      ...candidate.executable_artifacts,
      ...candidate.routing_artifacts,
      ...candidate.status_surface_ids,
      ...(candidate.blocker ? [candidate.blocker] : []),
    ],
    blockers: [],
    next_route: "append this terminal chain link, then require the next release to start from its resulting head",
  };
}
