import type { EmbodimentRunnerSchedulerVerdict } from "./embodiment-runner-scheduler.js";
import type { GithubContentsMutation, GithubContentsMutationKind } from "./github-contents-executor.js";

export type RunnerTicketExecutorAction = "compile_runner_ticket_mutations" | "block_runner_ticket_execution";

export interface RunnerTicketMutationSpec {
  mutation_id: string;
  kind: GithubContentsMutationKind;
  path: string;
  commit_message: string;
  content_source: string;
  current_blob_sha?: string;
  artifact_class: string;
  receipt_id: string;
}

export interface RunnerTicketExecutorInput {
  scheduler: EmbodimentRunnerSchedulerVerdict;
  active_branch: string;
  live_head_sha: string;
  execution_id: string;
  spent_execution_ids: string[];
  mutations: RunnerTicketMutationSpec[];
}

export interface RunnerTicketReceiptSeed {
  receipt_id: string;
  execution_id: string;
  artifact_class: string;
  base_head_sha: string;
  expected_result_head: string;
  next_status_expected_head: string;
}

export interface RunnerTicketExecutorVerdict {
  ok: boolean;
  action: RunnerTicketExecutorAction;
  branch: string;
  head_sha: string;
  execution_id: string;
  ticket_id: string | null;
  mutations: GithubContentsMutation[];
  receipt_seeds: RunnerTicketReceiptSeed[];
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

function base(input: RunnerTicketExecutorInput): Pick<
  RunnerTicketExecutorVerdict,
  "branch" | "head_sha" | "execution_id" | "ticket_id"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    execution_id: input.execution_id,
    ticket_id: input.scheduler.ticket?.ticket_id ?? null,
  };
}

function block(input: RunnerTicketExecutorInput, blockers: string[], nextRoute: string): RunnerTicketExecutorVerdict {
  return {
    ...base(input),
    ok: false,
    action: "block_runner_ticket_execution",
    mutations: [],
    receipt_seeds: [],
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }

  return [...duplicates];
}

function mutationBlockers(input: RunnerTicketExecutorInput, mutation: RunnerTicketMutationSpec): string[] {
  const blockers: string[] = [];
  const ticket = input.scheduler.ticket;

  if (!mutation.mutation_id.trim()) blockers.push("runner ticket mutation has no mutation id");
  if (!mutation.path.trim()) blockers.push(`runner ticket mutation ${mutation.mutation_id || "<missing>"} has no path`);
  if (!mutation.commit_message.trim()) blockers.push(`runner ticket mutation ${mutation.mutation_id} has no commit message`);
  if (!mutation.content_source.trim()) blockers.push(`runner ticket mutation ${mutation.mutation_id} has no content source`);
  if (!mutation.artifact_class.trim()) blockers.push(`runner ticket mutation ${mutation.mutation_id} has no artifact class`);
  if (!mutation.receipt_id.trim()) blockers.push(`runner ticket mutation ${mutation.mutation_id} has no receipt id`);
  if (!executablePlatformPath(mutation.path)) blockers.push(`runner ticket mutation is not executable platform code: ${mutation.path}`);
  if (mutation.kind === "update_file" && !mutation.current_blob_sha?.trim()) {
    blockers.push(`runner ticket update ${mutation.mutation_id} has no current blob sha`);
  }
  if (ticket && mutation.artifact_class !== ticket.artifact_class) {
    blockers.push(
      `runner ticket mutation artifact ${mutation.artifact_class} does not match ticket artifact ${ticket.artifact_class}`,
    );
  }

  return blockers;
}

function toGithubMutation(mutation: RunnerTicketMutationSpec): GithubContentsMutation {
  return {
    mutation_id: mutation.mutation_id,
    kind: mutation.kind,
    path: mutation.path,
    commit_message: mutation.commit_message,
    content_source: mutation.content_source,
    current_blob_sha: mutation.current_blob_sha,
  };
}

function toReceiptSeed(input: RunnerTicketExecutorInput, mutation: RunnerTicketMutationSpec): RunnerTicketReceiptSeed {
  return {
    receipt_id: mutation.receipt_id,
    execution_id: input.execution_id,
    artifact_class: mutation.artifact_class,
    base_head_sha: input.live_head_sha,
    expected_result_head: "post-write-head",
    next_status_expected_head: "post-write-head",
  };
}

export function compileRunnerTicketExecution(input: RunnerTicketExecutorInput): RunnerTicketExecutorVerdict {
  if (!input.scheduler.ok || input.scheduler.action !== "schedule_next_embodiment_runner" || !input.scheduler.ticket) {
    return block(
      input,
      input.scheduler.blockers.length > 0 ? input.scheduler.blockers : ["scheduler did not produce an embodiment runner ticket"],
      "schedule a runnable embodiment ticket before compiling execution mutations",
    );
  }

  const ticket = input.scheduler.ticket;
  if (ticket.branch !== input.active_branch) {
    return block(
      input,
      [`runner ticket branch ${ticket.branch} does not match active branch ${input.active_branch}`],
      "rebind the runner ticket to the active PR branch before execution",
    );
  }

  if (ticket.base_head_sha !== input.live_head_sha || input.scheduler.head_sha !== input.live_head_sha) {
    return block(
      input,
      [`runner ticket is based on ${ticket.base_head_sha}, not live head ${input.live_head_sha}`],
      "discard stale runner tickets after the PR head moves",
    );
  }

  if (!input.execution_id.trim()) {
    return block(input, ["runner ticket execution has no execution id"], "name the execution before branch mutation");
  }

  if (input.spent_execution_ids.includes(input.execution_id)) {
    return block(
      input,
      [`runner ticket execution already spent: ${input.execution_id}`],
      "choose an unspent execution id before compiling another ticket execution",
    );
  }

  if (input.mutations.length === 0) {
    return block(input, ["runner ticket execution has no mutations"], "supply executable platform mutations for the ticket");
  }

  const blockers = input.mutations.flatMap((mutation) => mutationBlockers(input, mutation));
  blockers.push(...duplicateValues(input.mutations.map((mutation) => mutation.path)).map((path) => `runner ticket repeats path: ${path}`));
  blockers.push(
    ...duplicateValues(input.mutations.map((mutation) => mutation.receipt_id)).map(
      (receipt) => `runner ticket repeats receipt id: ${receipt}`,
    ),
  );

  if (blockers.length > 0) {
    return block(input, blockers, "repair the runner-ticket mutation set before writing the branch");
  }

  const mutations = input.mutations.map(toGithubMutation);
  const receiptSeeds = input.mutations.map((mutation) => toReceiptSeed(input, mutation));

  return {
    ...base(input),
    ok: true,
    action: "compile_runner_ticket_mutations",
    mutations,
    receipt_seeds: receiptSeeds,
    decisive_evidence: [
      input.execution_id,
      ticket.ticket_id,
      ticket.artifact_class,
      ticket.capability_axis,
      `base ${input.live_head_sha}`,
      ...mutations.map((mutation) => `${mutation.kind}:${mutation.path}`),
      ...receiptSeeds.map((receipt) => receipt.receipt_id),
    ],
    blockers: [],
    next_route: "write the compiled mutations serially, then issue live progress receipts against the moved head",
  };
}
