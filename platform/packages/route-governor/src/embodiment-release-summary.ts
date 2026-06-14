export type EmbodimentReleaseSummaryStatusClaim = "none" | "passing" | "passing_with_warnings" | "pending" | "failing";

export type EmbodimentReleaseSummaryAction =
  | "accept_moved_head_summary"
  | "block_branch_mismatch"
  | "block_unmoved_head"
  | "block_status_claim_without_readback"
  | "block_incomplete_summary";

export interface EmbodimentReleaseSummaryInput {
  active_branch: string;
  summary_branch: string;
  previous_head_sha: string;
  resulting_head_sha: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  status_claim: EmbodimentReleaseSummaryStatusClaim;
  status_readback_head_sha?: string;
  resolved_historical_heads: string[];
}

export interface EmbodimentReleaseSummaryVerdict {
  ok: boolean;
  action: EmbodimentReleaseSummaryAction;
  branch: string;
  previous_head_sha: string;
  head_sha: string;
  quarantined_heads: string[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function base(input: EmbodimentReleaseSummaryInput): Pick<
  EmbodimentReleaseSummaryVerdict,
  "branch" | "previous_head_sha" | "head_sha" | "quarantined_heads"
> {
  const quarantined = new Set(input.resolved_historical_heads.filter((head) => head !== input.resulting_head_sha));
  if (input.status_readback_head_sha && input.status_readback_head_sha !== input.resulting_head_sha) {
    quarantined.add(input.status_readback_head_sha);
  }

  return {
    branch: input.active_branch,
    previous_head_sha: input.previous_head_sha,
    head_sha: input.resulting_head_sha,
    quarantined_heads: [...quarantined],
  };
}

function block(
  input: EmbodimentReleaseSummaryInput,
  action: Exclude<EmbodimentReleaseSummaryAction, "accept_moved_head_summary">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): EmbodimentReleaseSummaryVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function incompleteSummary(input: EmbodimentReleaseSummaryInput): string[] {
  const executableChanges = input.changed_files.filter(executablePlatformPath);
  const behaviorChanges = executableChanges.filter((path) => !proofOnlyPath(path));
  const blockers: string[] = [];

  if (executableChanges.length === 0) blockers.push("release summary cites no executable platform file");
  if (behaviorChanges.length === 0) blockers.push("release summary cites no behavior-bearing platform file");
  if (input.executable_artifacts.length === 0) blockers.push("release summary has no executable artifact evidence");
  if (input.routing_artifacts.length === 0) blockers.push("release summary has no future-routing artifact evidence");
  if (input.proof_artifacts.length === 0) blockers.push("release summary has no proof artifact evidence");

  return blockers;
}

export function compileEmbodimentReleaseSummary(
  input: EmbodimentReleaseSummaryInput,
): EmbodimentReleaseSummaryVerdict {
  if (input.summary_branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`summary branch ${input.summary_branch} does not match active branch ${input.active_branch}`],
      "bind the release summary to the active manifestation branch before publishing it",
    );
  }

  if (input.previous_head_sha === input.resulting_head_sha) {
    return block(
      input,
      "block_unmoved_head",
      [`release summary did not move beyond ${input.previous_head_sha}`],
      "do not publish an embodiment summary until the external branch head moves",
    );
  }

  if (input.status_claim !== "none") {
    if (!input.status_readback_head_sha) {
      return block(
        input,
        "block_status_claim_without_readback",
        [`status claim ${input.status_claim} has no readback head`],
        "publish the embodiment summary with no status claim, then read status for the resulting head",
      );
    }

    if (input.status_readback_head_sha !== input.resulting_head_sha) {
      return block(
        input,
        "block_status_claim_without_readback",
        [`status claim ${input.status_claim} belongs to ${input.status_readback_head_sha}, not resulting head ${input.resulting_head_sha}`],
        "quarantine stale status readbacks and read status for the resulting head before claiming checks",
      );
    }
  }

  const blockers = incompleteSummary(input);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_summary",
      blockers,
      "cite behavior, executable, routing, and proof evidence before counting the summary as a release receipt",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_moved_head_summary",
    decisive_evidence: unique([
      `head moved from ${input.previous_head_sha} to ${input.resulting_head_sha}`,
      ...input.changed_files.filter(executablePlatformPath),
      ...input.executable_artifacts,
      ...input.routing_artifacts,
      ...input.proof_artifacts,
      input.status_claim === "none"
        ? `no status claim made for ${input.resulting_head_sha}`
        : `status claim ${input.status_claim} bound to ${input.resulting_head_sha}`,
    ]),
    blockers: [],
    next_route: "publish the moved-head embodiment summary; the next valid status claim must read checks for the resulting head",
  };
}
