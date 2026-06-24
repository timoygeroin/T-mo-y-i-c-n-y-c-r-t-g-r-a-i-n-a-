export type HeadSourceArbitrationAction =
  | "use_live_head"
  | "read_live_head_status"
  | "accept_live_status"
  | "repair_live_failure"
  | "block_stale_source"
  | "block_release";

export type HeadSourceKind = "prompt" | "pr_body_readback" | "live_pr_metadata" | "actions_readback" | "public_checks_page";

export type HeadStatusVerdict = "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";

export interface HeadSourceEvidence {
  source_id: string;
  kind: HeadSourceKind;
  head_sha: string;
  status_verdict?: HeadStatusVerdict;
  evidence: string[];
}

export interface HeadSourceArbitrationInput {
  branch: string;
  active_branch: string;
  live_head_sha: string;
  sources: HeadSourceEvidence[];
  prohibited_heads: string[];
  prohibited_blockers: string[];
  attempted_blocker?: string;
}

export interface HeadSourceArbitrationVerdict {
  ok: boolean;
  action: HeadSourceArbitrationAction;
  branch: string;
  head_sha: string;
  accepted_source_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function base(input: HeadSourceArbitrationInput): Pick<HeadSourceArbitrationVerdict, "branch" | "head_sha"> {
  return {
    branch: input.branch,
    head_sha: input.live_head_sha,
  };
}

function liveSource(input: HeadSourceArbitrationInput): HeadSourceEvidence | undefined {
  return input.sources.find((source) => source.kind === "live_pr_metadata" && source.head_sha === input.live_head_sha);
}

function isStatusSource(source: HeadSourceEvidence): boolean {
  return source.kind === "actions_readback" || source.kind === "pr_body_readback" || source.kind === "public_checks_page";
}

function liveStatusSource(input: HeadSourceArbitrationInput): HeadSourceEvidence | undefined {
  return input.sources.find(
    (source) => isStatusSource(source) && source.head_sha === input.live_head_sha && Boolean(source.status_verdict),
  );
}

function staleSources(input: HeadSourceArbitrationInput): HeadSourceEvidence[] {
  return input.sources.filter((source) => source.head_sha !== input.live_head_sha);
}

function statusWarnings(source: HeadSourceEvidence | undefined): string[] {
  if (!source) return [];
  return source.evidence.filter((item) => /node\.js\s*20|actions?\s+deprecation/i.test(item));
}

function attemptedProhibitedBlocker(input: HeadSourceArbitrationInput): string | null {
  const attempted = input.attempted_blocker?.trim();
  if (!attempted) return null;
  return input.prohibited_blockers.includes(attempted) ? attempted : null;
}

export function arbitrateHeadSources(input: HeadSourceArbitrationInput): HeadSourceArbitrationVerdict {
  if (input.branch !== input.active_branch) {
    return {
      ...base(input),
      ok: false,
      action: "block_release",
      accepted_source_id: null,
      decisive_evidence: [],
      blockers: [`head-source arbitration branch ${input.branch} does not match active branch ${input.active_branch}`],
      warnings: [],
      next_route: "rebind head-source arbitration to the active PR branch before release",
    };
  }

  const prohibitedBlocker = attemptedProhibitedBlocker(input);
  if (prohibitedBlocker) {
    return {
      ...base(input),
      ok: false,
      action: "block_stale_source",
      accepted_source_id: null,
      decisive_evidence: [`attempted prohibited blocker: ${prohibitedBlocker}`],
      blockers: [`prohibited blocker cannot be emitted after live-head movement: ${prohibitedBlocker}`],
      warnings: [],
      next_route: "discard the prohibited blocker and arbitrate from the live PR head",
    };
  }

  const live = liveSource(input);
  if (!live) {
    return {
      ...base(input),
      ok: false,
      action: "block_release",
      accepted_source_id: null,
      decisive_evidence: [],
      blockers: [`no live PR metadata source is attached for ${input.live_head_sha}`],
      warnings: [],
      next_route: "attach live PR metadata before reconciling prompt, PR-body, or public-checks head claims",
    };
  }

  if (input.prohibited_heads.includes(input.live_head_sha)) {
    return {
      ...base(input),
      ok: false,
      action: "block_release",
      accepted_source_id: live.source_id,
      decisive_evidence: live.evidence,
      blockers: [`live head ${input.live_head_sha} is marked prohibited and cannot be used for release`],
      warnings: [],
      next_route: "obtain a non-prohibited live PR head before continuing",
    };
  }

  const status = liveStatusSource(input);
  const stale = staleSources(input);

  if (!status && stale.length > 0) {
    return {
      ...base(input),
      ok: true,
      action: "read_live_head_status",
      accepted_source_id: live.source_id,
      decisive_evidence: [
        ...live.evidence,
        ...stale.map((source) => `${source.kind} ${source.source_id} is stale at ${source.head_sha}`),
      ],
      blockers: [],
      warnings: [],
      next_route: "read status for the live PR head before using prompt-carried, PR-body, or public-checks status claims",
    };
  }

  if (!status) {
    return {
      ...base(input),
      ok: true,
      action: "use_live_head",
      accepted_source_id: live.source_id,
      decisive_evidence: live.evidence,
      blockers: [],
      warnings: [],
      next_route: "continue from the live PR head and attach status evidence before pass/fail claims",
    };
  }

  const warnings = statusWarnings(status);
  if (status.status_verdict === "passing" || status.status_verdict === "passing_with_warnings") {
    return {
      ...base(input),
      ok: true,
      action: "accept_live_status",
      accepted_source_id: status.source_id,
      decisive_evidence: status.evidence,
      blockers: [],
      warnings,
      next_route: "continue from the live PR head; stale prompt, PR-body, or public-checks heads may not override this status",
    };
  }

  if (status.status_verdict === "failing") {
    return {
      ...base(input),
      ok: false,
      action: "repair_live_failure",
      accepted_source_id: status.source_id,
      decisive_evidence: status.evidence,
      blockers: status.evidence.length > 0 ? status.evidence : [`live head ${input.live_head_sha} is failing`],
      warnings,
      next_route: "repair only the live-head failure or obtain its concrete log surface",
    };
  }

  return {
    ...base(input),
    ok: false,
    action: "read_live_head_status",
    accepted_source_id: status.source_id,
    decisive_evidence: status.evidence,
    blockers: [`live head status verdict is ${status.status_verdict}`],
    warnings,
    next_route: "wait for or obtain a complete live-head status surface before another release claim",
  };
}
