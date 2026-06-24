import type { GithubContentsMutationBatchVerdict, OrderedGithubContentsMutation } from "./github-contents-mutation-batch.js";

export type GithubContentsExecutionPreflightAction =
  | "preflight_github_contents_execution"
  | "block_github_contents_execution_preflight";

export interface GithubContentsExecutionPreflightInput {
  batch: GithubContentsMutationBatchVerdict;
  active_branch: string;
  live_head_sha: string;
  preflight_id: string;
  spent_preflight_ids: string[];
}

export interface PreflightedGithubContentsOperation extends OrderedGithubContentsMutation {
  repository_full_name: string;
  branch: string;
  expected_head_sha: string;
  lease_id: string;
  concurrency_key: string;
}

export interface GithubContentsExecutionPreflightVerdict {
  ok: boolean;
  action: GithubContentsExecutionPreflightAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  preflight_id: string;
  concurrency_key: string | null;
  operations: PreflightedGithubContentsOperation[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: GithubContentsExecutionPreflightInput): Pick<
  GithubContentsExecutionPreflightVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "preflight_id"
> {
  return {
    repository_full_name: input.batch.repository_full_name,
    pr_number: input.batch.pr_number,
    branch: input.batch.branch,
    head_sha: input.batch.head_sha,
    preflight_id: input.preflight_id,
  };
}

function block(
  input: GithubContentsExecutionPreflightInput,
  blockers: string[],
  nextRoute: string,
): GithubContentsExecutionPreflightVerdict {
  return {
    ...base(input),
    ok: false,
    action: "block_github_contents_execution_preflight",
    concurrency_key: input.batch.concurrency_key,
    operations: [],
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function proofOnlyPath(path: string): boolean {
  return /(?:\.test|-proof)\.ts$/.test(path);
}

function operationBlockers(operation: OrderedGithubContentsMutation): string[] {
  const blockers: string[] = [];

  if (!Number.isInteger(operation.sequence) || operation.sequence < 1) {
    blockers.push(`operation ${operation.mutation_id || "<missing>"} has invalid sequence ${operation.sequence}`);
  }
  if (!operation.mutation_id.trim()) blockers.push("preflight operation has no mutation id");
  if (!operation.path.trim()) blockers.push(`preflight operation ${operation.mutation_id || "<missing>"} has no path`);
  if (!operation.commit_message.trim()) {
    blockers.push(`preflight operation ${operation.mutation_id} has no commit message`);
  }
  if (!operation.content_source.trim()) {
    blockers.push(`preflight operation ${operation.mutation_id} has no content source`);
  }
  if (operation.kind === "update_file" && !operation.current_blob_sha?.trim()) {
    blockers.push(`preflight update ${operation.mutation_id} has no current blob sha`);
  }

  return blockers;
}

function orderedSerialBlockers(operations: OrderedGithubContentsMutation[]): string[] {
  const blockers: string[] = [];

  operations.forEach((operation, index) => {
    if (operation.sequence !== index + 1) {
      blockers.push(`operation ${operation.mutation_id} sequence ${operation.sequence} is not serial position ${index + 1}`);
    }
  });

  return blockers;
}

function toOperation(
  input: GithubContentsExecutionPreflightInput,
  operation: OrderedGithubContentsMutation,
  concurrencyKey: string,
  leaseId: string,
): PreflightedGithubContentsOperation {
  return {
    ...operation,
    repository_full_name: input.batch.repository_full_name,
    branch: input.batch.branch,
    expected_head_sha: input.batch.head_sha,
    lease_id: leaseId,
    concurrency_key: concurrencyKey,
  };
}

export function compileGithubContentsExecutionPreflight(
  input: GithubContentsExecutionPreflightInput,
): GithubContentsExecutionPreflightVerdict {
  if (!input.batch.ok || input.batch.action !== "compile_serial_contents_batch") {
    return block(
      input,
      input.batch.blockers.length > 0 ? input.batch.blockers : [`contents batch is not executable: ${input.batch.action}`],
      "compile an accepted serial contents mutation batch before preflight execution",
    );
  }

  if (input.batch.branch !== input.active_branch) {
    return block(
      input,
      [`preflight branch ${input.batch.branch} does not match active branch ${input.active_branch}`],
      "rebind contents execution preflight to the active PR branch",
    );
  }

  if (input.batch.head_sha !== input.live_head_sha) {
    return block(
      input,
      [`preflight batch head ${input.batch.head_sha} does not match live head ${input.live_head_sha}`],
      "refresh the contents mutation batch from the current PR head before connector writes",
    );
  }

  const preflightId = input.preflight_id.trim();
  if (!preflightId) {
    return block(input, ["github contents execution preflight has no preflight id"], "name the preflight before release");
  }

  if (input.spent_preflight_ids.includes(preflightId)) {
    return block(
      input,
      [`github contents execution preflight already spent: ${preflightId}`],
      "choose a new preflight id before issuing another contents write plan",
    );
  }

  if (!input.batch.concurrency_key) {
    return block(
      input,
      ["compiled contents batch has no concurrency key"],
      "compile a serial batch with a branch/head/batch concurrency key before execution",
    );
  }

  if (!input.batch.lease_id) {
    return block(
      input,
      ["compiled contents batch has no write lease id"],
      "accept a write lease before preflighting connector writes",
    );
  }

  const blockers = [
    ...input.batch.ordered_mutations.flatMap(operationBlockers),
    ...orderedSerialBlockers(input.batch.ordered_mutations),
  ];
  const executableMutations = input.batch.ordered_mutations.filter((operation) => executablePlatformPath(operation.path));
  const behaviorMutations = executableMutations.filter((operation) => !proofOnlyPath(operation.path));

  if (executableMutations.length === 0) blockers.push("execution preflight has no executable platform mutation");
  if (behaviorMutations.length === 0) blockers.push("execution preflight has no behavior-bearing platform mutation");

  if (blockers.length > 0) {
    return block(input, blockers, "repair the serial contents operations before connector execution");
  }

  const operations = input.batch.ordered_mutations.map((operation) =>
    toOperation(input, operation, input.batch.concurrency_key as string, input.batch.lease_id as string),
  );

  return {
    ...base(input),
    ok: true,
    action: "preflight_github_contents_execution",
    preflight_id: preflightId,
    concurrency_key: input.batch.concurrency_key,
    operations,
    decisive_evidence: [
      preflightId,
      input.batch.concurrency_key,
      input.batch.lease_id,
      ...operations.map((operation) => `${operation.sequence}:${operation.kind}:${operation.path}`),
      ...input.batch.decisive_evidence,
    ],
    blockers: [],
    next_route: "issue the preflighted GitHub contents operations serially, then bind the result receipt and status readback to the moved head",
  };
}
