import type { RuntimeExecutionQueueVerdict } from "./runtime-execution-queue.js";

export type GithubContentsMutationKind = "create_file" | "update_file";
export type GithubContentsExecutorAction =
  | "execute_github_contents_writes"
  | "publish_without_contents_write"
  | "block_github_contents_execution";

export interface GithubContentsMutation {
  mutation_id: string;
  kind: GithubContentsMutationKind;
  path: string;
  commit_message: string;
  content_source: string;
  current_blob_sha?: string;
}

export interface GithubContentsExecutorInput {
  queue: RuntimeExecutionQueueVerdict;
  active_branch: string;
  live_head_sha: string;
  executor_plan_id: string;
  spent_executor_plan_ids: string[];
  mutations: GithubContentsMutation[];
}

export interface GithubContentsOperation {
  mutation_id: string;
  method: GithubContentsMutationKind;
  repository_full_name: string;
  branch: string;
  expected_head_sha: string;
  path: string;
  commit_message: string;
  content_source: string;
  current_blob_sha?: string;
}

export interface GithubContentsExecutorVerdict {
  ok: boolean;
  action: GithubContentsExecutorAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  executor_plan_id: string;
  operations: GithubContentsOperation[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: GithubContentsExecutorInput): Pick<
  GithubContentsExecutorVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "executor_plan_id"
> {
  return {
    repository_full_name: input.queue.repository_full_name,
    pr_number: input.queue.pr_number,
    branch: input.queue.branch,
    head_sha: input.queue.head_sha,
    executor_plan_id: input.executor_plan_id,
  };
}

function block(
  input: GithubContentsExecutorInput,
  blockers: string[],
  nextRoute: string,
): GithubContentsExecutorVerdict {
  return {
    ...base(input),
    ok: false,
    action: "block_github_contents_execution",
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

function mutationBlockers(mutation: GithubContentsMutation): string[] {
  const blockers: string[] = [];

  if (!mutation.mutation_id.trim()) blockers.push("github contents mutation has no mutation id");
  if (!mutation.path.trim()) blockers.push("github contents mutation has no path");
  if (!mutation.commit_message.trim()) blockers.push(`github contents mutation ${mutation.mutation_id} has no commit message`);
  if (!mutation.content_source.trim()) blockers.push(`github contents mutation ${mutation.mutation_id} has no content source`);
  if (mutation.kind === "update_file" && !mutation.current_blob_sha?.trim()) {
    blockers.push(`github contents update ${mutation.mutation_id} has no current blob sha`);
  }

  return blockers;
}

function toOperation(input: GithubContentsExecutorInput, mutation: GithubContentsMutation): GithubContentsOperation {
  return {
    mutation_id: mutation.mutation_id,
    method: mutation.kind,
    repository_full_name: input.queue.repository_full_name,
    branch: input.queue.branch,
    expected_head_sha: input.queue.head_sha,
    path: mutation.path,
    commit_message: mutation.commit_message,
    content_source: mutation.content_source,
    current_blob_sha: mutation.current_blob_sha,
  };
}

export function compileGithubContentsExecutorPlan(
  input: GithubContentsExecutorInput,
): GithubContentsExecutorVerdict {
  if (input.queue.branch !== input.active_branch) {
    return block(
      input,
      [`queue branch ${input.queue.branch} does not match active branch ${input.active_branch}`],
      "rebind the executor plan to the active PR branch before writing contents",
    );
  }

  if (input.queue.head_sha !== input.live_head_sha) {
    return block(
      input,
      [`queue head ${input.queue.head_sha} does not match live head ${input.live_head_sha}`],
      "read the live PR head before compiling GitHub contents operations",
    );
  }

  if (!input.executor_plan_id.trim()) {
    return block(input, ["github contents executor has no plan id"], "name the executor plan before release");
  }

  if (input.spent_executor_plan_ids.includes(input.executor_plan_id)) {
    return block(
      input,
      [`github contents executor plan already spent: ${input.executor_plan_id}`],
      "choose a new executor plan id before moving the branch again",
    );
  }

  if (!input.queue.ok) {
    return block(
      input,
      input.queue.blockers.length > 0 ? input.queue.blockers : ["runtime execution queue is not executable"],
      "repair the runtime queue before compiling contents operations",
    );
  }

  if (input.queue.action !== "enqueue_external_embodiment") {
    return {
      ...base(input),
      ok: true,
      action: "publish_without_contents_write",
      operations: [],
      decisive_evidence: [input.executor_plan_id, input.queue.action, ...input.queue.decisive_evidence],
      blockers: input.queue.blockers,
      next_route: "publish the queued non-write release without a GitHub contents branch mutation",
    };
  }

  const writeStep = input.queue.steps.find((entry) => entry.kind === "write_branch");
  if (!writeStep) {
    return block(
      input,
      ["external embodiment queue has no write_branch step"],
      "compile a runtime queue with a branch-write step before contents execution",
    );
  }

  const blockers = input.mutations.flatMap(mutationBlockers);
  const executableMutations = input.mutations.filter((mutation) => executablePlatformPath(mutation.path));

  if (executableMutations.length === 0) {
    blockers.push("github contents executor has no executable platform mutation");
  }

  if (blockers.length > 0) {
    return block(input, blockers, "supply complete executable create/update mutations before contents execution");
  }

  const operations = input.mutations.map((mutation) => toOperation(input, mutation));

  return {
    ...base(input),
    ok: true,
    action: "execute_github_contents_writes",
    operations,
    decisive_evidence: [
      input.executor_plan_id,
      writeStep.command,
      ...operations.map((operation) => `${operation.method}:${operation.path}`),
      ...input.queue.decisive_evidence,
    ],
    blockers: [],
    next_route: "execute the GitHub contents operations, then read the moved PR head status surface before any status claim",
  };
}
