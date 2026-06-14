export type ExternalWriteLeaseSurface =
  | "github_contents_create_file"
  | "github_contents_update_file"
  | "local_git_push"
  | "connector_branch_ref_update";

export type ExternalWriteLeaseAction =
  | "accept_write_lease"
  | "block_branch_mismatch"
  | "block_stale_observed_head"
  | "block_missing_write_surface"
  | "block_repeated_write_class"
  | "block_incomplete_write_plan"
  | "block_unmoved_result_head";

export interface ExternalWriteLeaseInput {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  active_branch: string;
  observed_head_sha: string;
  live_head_sha: string;
  write_surface?: ExternalWriteLeaseSurface;
  write_class: string;
  spent_write_classes: string[];
  planned_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  resulting_head_sha?: string;
  next_status_expected_head?: string;
}

export interface ExternalWriteLeaseVerdict {
  ok: boolean;
  action: ExternalWriteLeaseAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  lease_id: string | null;
  next_status_expected_head: string | null;
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

function base(input: ExternalWriteLeaseInput): Pick<
  ExternalWriteLeaseVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "next_status_expected_head"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.branch,
    head_sha: input.live_head_sha,
    next_status_expected_head: input.next_status_expected_head ?? input.resulting_head_sha ?? null,
  };
}

function block(
  input: ExternalWriteLeaseInput,
  action: Exclude<ExternalWriteLeaseAction, "accept_write_lease">,
  blockers: string[],
  nextRoute: string,
): ExternalWriteLeaseVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    lease_id: null,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function incompletePlanBlockers(input: ExternalWriteLeaseInput): string[] {
  const blockers: string[] = [];

  if (!input.repository_full_name.trim()) blockers.push("write lease has no repository");
  if (!Number.isInteger(input.pr_number) || input.pr_number < 1) blockers.push("write lease has no valid PR number");
  if (!input.write_class.trim()) blockers.push("write lease has no write class");
  if (!input.planned_files.some(executablePlatformPath)) {
    blockers.push("write lease has no executable platform file in planned files");
  }
  if (input.executable_artifacts.length === 0) blockers.push("write lease has no executable artifact evidence");
  if (input.routing_artifacts.length === 0) blockers.push("write lease has no future-routing artifact evidence");
  if (input.proof_artifacts.length === 0) blockers.push("write lease has no proof artifact evidence");

  return blockers;
}

function leaseId(input: ExternalWriteLeaseInput): string {
  return [input.repository_full_name, `pr-${input.pr_number}`, input.branch, input.live_head_sha, input.write_class].join("|");
}

function nextStatusHead(input: ExternalWriteLeaseInput): string {
  return input.next_status_expected_head ?? input.resulting_head_sha ?? "post-write-head";
}

export function compileExternalWriteLease(input: ExternalWriteLeaseInput): ExternalWriteLeaseVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`write lease branch ${input.branch} does not match active branch ${input.active_branch}`],
      "rebind the write lease to the active PR branch before touching the external branch",
    );
  }

  if (input.observed_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_observed_head",
      [`write lease observed ${input.observed_head_sha}, but live head is ${input.live_head_sha}`],
      "refresh the live PR head before compiling any branch write",
    );
  }

  if (!input.write_surface) {
    return block(
      input,
      "block_missing_write_surface",
      ["write lease has no external write surface"],
      "select a concrete GitHub contents, branch ref, or git push surface before write execution",
    );
  }

  if (input.spent_write_classes.includes(input.write_class)) {
    return block(
      input,
      "block_repeated_write_class",
      [`write lease repeats spent write class: ${input.write_class}`],
      "choose a non-repeated executable write class before moving the branch again",
    );
  }

  const blockers = incompletePlanBlockers(input);
  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_write_plan",
      blockers,
      "complete planned executable files, route evidence, and proof evidence before acquiring a write lease",
    );
  }

  if (input.resulting_head_sha && input.resulting_head_sha === input.live_head_sha) {
    return block(
      input,
      "block_unmoved_result_head",
      [`resulting head ${input.resulting_head_sha} does not move beyond live head ${input.live_head_sha}`],
      "execute a branch-moving write before compiling the external write receipt",
    );
  }

  if (
    input.resulting_head_sha &&
    input.next_status_expected_head &&
    input.next_status_expected_head !== input.resulting_head_sha
  ) {
    return block(
      input,
      "block_unmoved_result_head",
      [
        `next status expected head ${input.next_status_expected_head} does not match resulting head ${input.resulting_head_sha}`,
      ],
      "bind the next status readback to the exact resulting branch head",
    );
  }

  const expectedHead = nextStatusHead(input);

  return {
    ...base(input),
    ok: true,
    action: "accept_write_lease",
    lease_id: leaseId(input),
    next_status_expected_head: expectedHead,
    decisive_evidence: [
      `observed live head ${input.live_head_sha}`,
      `write surface ${input.write_surface}`,
      input.write_class,
      ...input.planned_files.filter(executablePlatformPath),
      ...input.executable_artifacts,
      ...input.routing_artifacts,
      ...input.proof_artifacts,
      `next status expected head ${expectedHead}`,
    ],
    blockers: [],
    next_route: `execute the leased branch write, then compile a completion receipt and status cursor for ${expectedHead}`,
  };
}
