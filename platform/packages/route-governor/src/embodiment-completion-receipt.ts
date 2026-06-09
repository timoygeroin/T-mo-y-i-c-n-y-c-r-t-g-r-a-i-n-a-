export type EmbodimentCompletionStatusClaim = "none" | "passing" | "passing_with_warnings" | "pending" | "failing";

export type EmbodimentCompletionReceiptAction =
  | "accept_completion_receipt"
  | "block_branch_mismatch"
  | "block_no_head_move"
  | "block_repeated_artifact_class"
  | "block_incomplete_receipt"
  | "block_unbound_status_claim";

export interface EmbodimentCompletionReceiptInput {
  repository: string;
  pr_number: number;
  branch: string;
  active_branch: string;
  previous_head_sha: string;
  new_head_sha: string;
  artifact_class: string;
  spent_artifact_classes: string[];
  committed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  status_claim: EmbodimentCompletionStatusClaim;
  status_readback_head_sha?: string;
}

export interface EmbodimentCompletionReceiptVerdict {
  ok: boolean;
  action: EmbodimentCompletionReceiptAction;
  repository: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  receipt_class: "external_embodiment_completion";
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: EmbodimentCompletionReceiptInput): Pick<
  EmbodimentCompletionReceiptVerdict,
  "repository" | "pr_number" | "branch" | "head_sha" | "receipt_class"
> {
  return {
    repository: input.repository,
    pr_number: input.pr_number,
    branch: input.branch,
    head_sha: input.new_head_sha,
    receipt_class: "external_embodiment_completion",
  };
}

function block(
  input: EmbodimentCompletionReceiptInput,
  action: Exclude<EmbodimentCompletionReceiptAction, "accept_completion_receipt">,
  blockers: string[],
  nextRoute: string,
): EmbodimentCompletionReceiptVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function incompleteBlockers(input: EmbodimentCompletionReceiptInput): string[] {
  const blockers: string[] = [];

  if (!input.repository.trim()) {
    blockers.push("completion receipt has no repository");
  }
  if (!Number.isInteger(input.pr_number) || input.pr_number < 1) {
    blockers.push("completion receipt has no valid PR number");
  }
  if (!input.artifact_class.trim()) {
    blockers.push("completion receipt has no artifact class");
  }
  if (!input.committed_files.some(executablePlatformPath)) {
    blockers.push("completion receipt has no executable platform file in committed files");
  }
  if (input.executable_artifacts.length === 0) {
    blockers.push("completion receipt has no executable artifact evidence");
  }
  if (input.routing_artifacts.length === 0) {
    blockers.push("completion receipt has no future-routing artifact evidence");
  }
  if (input.proof_artifacts.length === 0) {
    blockers.push("completion receipt has no proof artifact evidence");
  }

  return blockers;
}

export function compileEmbodimentCompletionReceipt(
  input: EmbodimentCompletionReceiptInput,
): EmbodimentCompletionReceiptVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`completion branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind the completion receipt to the active PR branch before release",
    );
  }

  if (input.previous_head_sha === input.new_head_sha) {
    return block(
      input,
      "block_no_head_move",
      [`completion receipt did not move the PR head from ${input.previous_head_sha}`],
      "commit a new executable embodiment before issuing a completion receipt",
    );
  }

  if (input.spent_artifact_classes.includes(input.artifact_class)) {
    return block(
      input,
      "block_repeated_artifact_class",
      [`completion receipt repeats spent artifact class: ${input.artifact_class}`],
      "choose a new artifact class before counting another embodiment increment",
    );
  }

  const blockers = incompleteBlockers(input);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_receipt",
      blockers,
      "attach repository, PR, executable files, route evidence, and proof evidence before receipt release",
    );
  }

  if (input.status_claim !== "none" && input.status_readback_head_sha !== input.new_head_sha) {
    return block(
      input,
      "block_unbound_status_claim",
      [
        input.status_readback_head_sha
          ? `status claim ${input.status_claim} belongs to ${input.status_readback_head_sha}, not new head ${input.new_head_sha}`
          : `status claim ${input.status_claim} has no readback bound to new head ${input.new_head_sha}`,
      ],
      "strip the status claim or attach a status readback for the exact new PR head",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_completion_receipt",
    decisive_evidence: [
      `${input.repository}#${input.pr_number}`,
      `head moved from ${input.previous_head_sha} to ${input.new_head_sha}`,
      input.artifact_class,
      ...input.committed_files.filter(executablePlatformPath),
      ...input.executable_artifacts,
      ...input.routing_artifacts,
      ...input.proof_artifacts,
      ...(input.status_claim === "none" ? ["no status claim made before new-head readback"] : [`status ${input.status_claim} bound to ${input.new_head_sha}`]),
    ],
    blockers: [],
    next_route: "open a status cursor for the new PR head before making any pass/fail claim",
  };
}
