export type BranchEmbodimentResultStatus =
  | "branch_write_executed"
  | "blocked"
  | "no_head_movement"
  | "synthetic_success";

export type BranchEmbodimentResultAction =
  | "accept_branch_embodiment_result"
  | "accept_branch_embodiment_blocker"
  | "block_unadmitted_write"
  | "block_wrong_surface"
  | "block_missing_head"
  | "block_unmoved_head"
  | "block_missing_behavior_file"
  | "block_missing_external_result"
  | "block_synthetic_success"
  | "block_missing_blocker";

export interface BranchEmbodimentResultReceiptInput {
  write_id: string;
  admitted_write_ids: string[];
  repository_full_name: string;
  pr_number: number;
  branch: string;
  pr_state: "open" | "closed";
  merged: boolean;
  base_head_sha: string;
  result_head_sha: string;
  status: BranchEmbodimentResultStatus;
  changed_files: string[];
  behavior_exports: string[];
  external_result_artifacts: string[];
  blocker?: string;
}

export interface BranchEmbodimentResultReceiptVerdict {
  ok: boolean;
  action: BranchEmbodimentResultAction;
  write_id: string | null;
  branch: string;
  base_head_sha: string;
  result_head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function clean(value: string): string {
  return value.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function executablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(?:ts|js|mjs|json)$/.test(path);
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function behaviorFiles(input: BranchEmbodimentResultReceiptInput): string[] {
  return input.changed_files.filter((path) => executablePlatformPath(path) && !proofOnlyPath(path));
}

function evidence(input: BranchEmbodimentResultReceiptInput): string[] {
  return unique([
    `write ${clean(input.write_id) || "<missing>"}`,
    `repository ${clean(input.repository_full_name) || "<missing>"}`,
    `pr #${input.pr_number}`,
    `branch ${clean(input.branch) || "<missing>"}`,
    `pr state ${input.pr_state}`,
    `merged ${input.merged}`,
    `base head ${clean(input.base_head_sha) || "<missing>"}`,
    `result head ${clean(input.result_head_sha) || "<missing>"}`,
    ...input.changed_files,
    ...input.behavior_exports,
    ...input.external_result_artifacts,
  ]);
}

function base(input: BranchEmbodimentResultReceiptInput): Pick<
  BranchEmbodimentResultReceiptVerdict,
  "write_id" | "branch" | "base_head_sha" | "result_head_sha"
> {
  return {
    write_id: clean(input.write_id) || null,
    branch: input.branch,
    base_head_sha: input.base_head_sha,
    result_head_sha: input.result_head_sha,
  };
}

function block(
  input: BranchEmbodimentResultReceiptInput,
  action: Exclude<BranchEmbodimentResultAction, "accept_branch_embodiment_result" | "accept_branch_embodiment_blocker">,
  blockers: string[],
  nextRoute: string,
): BranchEmbodimentResultReceiptVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: evidence(input),
    blockers: unique(blockers),
    next_route: nextRoute,
  };
}

export function acceptBranchEmbodimentResultReceipt(
  input: BranchEmbodimentResultReceiptInput,
): BranchEmbodimentResultReceiptVerdict {
  const writeId = clean(input.write_id);
  const blockerText = clean(input.blocker ?? "");

  if (!writeId || !input.admitted_write_ids.includes(writeId)) {
    return block(
      input,
      "block_unadmitted_write",
      [writeId ? `branch embodiment write was not admitted: ${writeId}` : "branch embodiment result has no write id"],
      "admit the branch embodiment write before accepting a result receipt",
    );
  }

  if (input.status === "blocked") {
    if (!blockerText) {
      return block(
        input,
        "block_missing_blocker",
        ["blocked branch embodiment result has no exact blocker"],
        "name the external blocker that stopped the branch embodiment write",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "accept_branch_embodiment_blocker",
      decisive_evidence: [...evidence(input), blockerText],
      blockers: [blockerText],
      next_route: "remove the accepted branch embodiment blocker before replaying this write",
    };
  }

  if (input.pr_state !== "closed" || !input.merged) {
    return block(
      input,
      "block_wrong_surface",
      ["branch embodiment result receipt is only for merged-PR branch continuation"],
      "use the PR-surface manifestation receipt while the PR is open",
    );
  }

  if (!clean(input.base_head_sha) || !clean(input.result_head_sha)) {
    return block(
      input,
      "block_missing_head",
      ["branch embodiment result is missing base or result head"],
      "attach both the pre-write branch head and the post-write branch head",
    );
  }

  if (input.status === "synthetic_success") {
    return block(
      input,
      "block_synthetic_success",
      ["synthetic success cannot satisfy a branch embodiment result receipt"],
      "attach an externally retrievable branch write result or emit an exact blocker",
    );
  }

  if (input.result_head_sha === input.base_head_sha || input.status === "no_head_movement") {
    return block(
      input,
      "block_unmoved_head",
      [`branch head did not move from ${input.base_head_sha}`],
      "execute a behavior-bearing branch write before accepting branch embodiment progress",
    );
  }

  const behavior = behaviorFiles(input);
  if (behavior.length === 0 || input.behavior_exports.length === 0) {
    return block(
      input,
      "block_missing_behavior_file",
      [
        ...(behavior.length === 0 ? ["branch result has no behavior-bearing executable platform file"] : []),
        ...(input.behavior_exports.length === 0 ? ["branch result has no behavior export evidence"] : []),
      ],
      "include a non-proof executable platform change before accepting branch embodiment progress",
    );
  }

  if (input.external_result_artifacts.length === 0 || input.status !== "branch_write_executed") {
    return block(
      input,
      "block_missing_external_result",
      [
        ...(input.external_result_artifacts.length === 0 ? ["branch result has no external artifact evidence"] : []),
        ...(input.status !== "branch_write_executed" ? [`branch result status is ${input.status}`] : []),
      ],
      "attach the externally retrievable commit, branch, or status artifact for the branch write",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_branch_embodiment_result",
    decisive_evidence: [...evidence(input), ...behavior],
    blockers: [],
    next_route: "perform status/readback only for the moved branch head, then admit the next non-repeated embodiment increment",
  };
}
