export type InstructionBlockerCandidateClass =
  | "exact_external_blocker"
  | "external_platform_embodiment"
  | "fresh_status_readback";

export type InstructionProhibitedBlockerAction =
  | "admit_candidate"
  | "block_branch_mismatch"
  | "block_stale_candidate_head"
  | "block_missing_blocker"
  | "block_prohibited_exact_blocker"
  | "block_prohibited_head_blocker"
  | "block_prohibited_term_blocker";

export interface InstructionProhibitedBlockerCandidate {
  move_class: InstructionBlockerCandidateClass;
  branch: string;
  base_head_sha: string;
  blocker?: string;
}

export interface InstructionProhibitedBlockerInput {
  active_branch: string;
  live_head_sha: string;
  prohibited_exact_blockers: string[];
  prohibited_head_shas: string[];
  prohibited_blocker_terms: string[];
  candidate: InstructionProhibitedBlockerCandidate;
}

export interface InstructionProhibitedBlockerVerdict {
  ok: boolean;
  action: InstructionProhibitedBlockerAction;
  branch: string;
  head_sha: string;
  quarantined_head_shas: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function containsNormalized(haystack: string, needle: string): boolean {
  return normalize(haystack).includes(normalize(needle));
}

function base(input: InstructionProhibitedBlockerInput): Pick<
  InstructionProhibitedBlockerVerdict,
  "branch" | "head_sha" | "quarantined_head_shas"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    quarantined_head_shas: input.prohibited_head_shas.filter((head) => head !== input.live_head_sha),
  };
}

function block(
  input: InstructionProhibitedBlockerInput,
  action: Exclude<InstructionProhibitedBlockerAction, "admit_candidate">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): InstructionProhibitedBlockerVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function guardInstructionProhibitedBlocker(
  input: InstructionProhibitedBlockerInput,
): InstructionProhibitedBlockerVerdict {
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
      "block_stale_candidate_head",
      [`candidate base ${candidate.base_head_sha} is not live PR head ${input.live_head_sha}`],
      "rebase the candidate to the live PR head before admitting or blocking it",
      [`live head ${input.live_head_sha}`, `candidate base ${candidate.base_head_sha}`],
    );
  }

  if (candidate.move_class !== "exact_external_blocker") {
    return {
      ...base(input),
      ok: true,
      action: "admit_candidate",
      decisive_evidence: [
        `candidate class ${candidate.move_class}`,
        `live head ${input.live_head_sha}`,
        ...base(input).quarantined_head_shas.map((head) => `quarantined prohibited head ${head}`),
      ],
      blockers: [],
      next_route: "continue with the admitted live-head non-blocker candidate",
    };
  }

  const blocker = candidate.blocker?.trim();
  if (!blocker) {
    return block(
      input,
      "block_missing_blocker",
      ["exact external blocker candidate has no blocker text"],
      "name one exact live-head blocker or choose embodiment/readback",
    );
  }

  const exactMatch = input.prohibited_exact_blockers.find((item) => normalize(item) === normalize(blocker));
  if (exactMatch) {
    return block(
      input,
      "block_prohibited_exact_blocker",
      [`prohibited blocker cannot be emitted: ${exactMatch}`],
      "discard the prohibited blocker and route from live-head embodiment, readback, or a different exact blocker",
      [blocker],
    );
  }

  const prohibitedHead = input.prohibited_head_shas.find((head) => blocker.includes(head));
  if (prohibitedHead) {
    return block(
      input,
      "block_prohibited_head_blocker",
      [`blocker targets prohibited historical head ${prohibitedHead}`],
      "do not convert a repaired or stale head into the current external blocker",
      [blocker, `live head ${input.live_head_sha}`, `prohibited head ${prohibitedHead}`],
    );
  }

  const prohibitedTerm = input.prohibited_blocker_terms.find((term) => containsNormalized(blocker, term));
  if (prohibitedTerm) {
    return block(
      input,
      "block_prohibited_term_blocker",
      [`blocker repeats prohibited term: ${prohibitedTerm}`],
      "choose a non-repeated live-head action or name a genuinely new exact external blocker",
      [blocker, `prohibited term ${prohibitedTerm}`],
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_candidate",
    decisive_evidence: [blocker, `live head ${input.live_head_sha}`],
    blockers: [blocker],
    next_route: "emit only this live-head exact external blocker and stop",
  };
}
