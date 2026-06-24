import type { ExternalWriteLeaseVerdict } from "./external-write-lease.js";
import type { GithubContentsMutation, GithubContentsMutationKind } from "./github-contents-executor.js";

export type GithubContentsMutationBatchAction =
  | "compile_serial_contents_batch"
  | "block_mutation_batch";

export interface GithubContentsMutationBatchInput {
  lease: ExternalWriteLeaseVerdict;
  active_branch: string;
  live_head_sha: string;
  batch_id: string;
  spent_batch_ids: string[];
  mutations: GithubContentsMutation[];
}

export interface OrderedGithubContentsMutation {
  sequence: number;
  mutation_id: string;
  kind: GithubContentsMutationKind;
  path: string;
  commit_message: string;
  content_source: string;
  current_blob_sha?: string;
}

export interface GithubContentsMutationBatchVerdict {
  ok: boolean;
  action: GithubContentsMutationBatchAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  lease_id: string | null;
  batch_id: string;
  concurrency_key: string | null;
  ordered_mutations: OrderedGithubContentsMutation[];
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

function base(input: GithubContentsMutationBatchInput): Pick<
  GithubContentsMutationBatchVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "lease_id" | "batch_id"
> {
  return {
    repository_full_name: input.lease.repository_full_name,
    pr_number: input.lease.pr_number,
    branch: input.lease.branch,
    head_sha: input.lease.head_sha,
    lease_id: input.lease.lease_id,
    batch_id: input.batch_id,
  };
}

function block(
  input: GithubContentsMutationBatchInput,
  blockers: string[],
  nextRoute: string,
): GithubContentsMutationBatchVerdict {
  return {
    ...base(input),
    ok: false,
    action: "block_mutation_batch",
    concurrency_key: null,
    ordered_mutations: [],
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function duplicatePaths(mutations: GithubContentsMutation[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const mutation of mutations) {
    if (seen.has(mutation.path)) duplicates.add(mutation.path);
    seen.add(mutation.path);
  }

  return [...duplicates];
}

function mutationBlockers(mutation: GithubContentsMutation): string[] {
  const blockers: string[] = [];

  if (!mutation.mutation_id.trim()) blockers.push("contents mutation has no mutation id");
  if (!mutation.path.trim()) blockers.push(`contents mutation ${mutation.mutation_id || "<missing>"} has no path`);
  if (!mutation.commit_message.trim()) blockers.push(`contents mutation ${mutation.mutation_id} has no commit message`);
  if (!mutation.content_source.trim()) blockers.push(`contents mutation ${mutation.mutation_id} has no content source`);
  if (mutation.kind === "update_file" && !mutation.current_blob_sha?.trim()) {
    blockers.push(`contents update ${mutation.mutation_id} has no current blob sha`);
  }

  return blockers;
}

function toOrderedMutation(mutation: GithubContentsMutation, index: number): OrderedGithubContentsMutation {
  return {
    sequence: index + 1,
    mutation_id: mutation.mutation_id,
    kind: mutation.kind,
    path: mutation.path,
    commit_message: mutation.commit_message,
    content_source: mutation.content_source,
    current_blob_sha: mutation.current_blob_sha,
  };
}

export function compileGithubContentsMutationBatch(
  input: GithubContentsMutationBatchInput,
): GithubContentsMutationBatchVerdict {
  if (!input.lease.ok || input.lease.action !== "accept_write_lease") {
    return block(
      input,
      input.lease.blockers.length > 0 ? input.lease.blockers : [`write lease is not accepted: ${input.lease.action}`],
      "accept a live-head external write lease before compiling contents mutations",
    );
  }

  if (input.lease.branch !== input.active_branch) {
    return block(
      input,
      [`mutation batch branch ${input.lease.branch} does not match active branch ${input.active_branch}`],
      "rebind the mutation batch to the active PR branch before connector writes",
    );
  }

  if (input.lease.head_sha !== input.live_head_sha) {
    return block(
      input,
      [`mutation batch lease head ${input.lease.head_sha} does not match live head ${input.live_head_sha}`],
      "refresh the write lease before compiling a batch from a moved head",
    );
  }

  if (!input.batch_id.trim()) {
    return block(input, ["contents mutation batch has no batch id"], "name the mutation batch before connector writes");
  }

  if (input.spent_batch_ids.includes(input.batch_id)) {
    return block(
      input,
      [`contents mutation batch already spent: ${input.batch_id}`],
      "choose a new batch id before issuing another branch write batch",
    );
  }

  if (input.mutations.length === 0) {
    return block(input, ["contents mutation batch has no mutations"], "supply at least one executable platform mutation");
  }

  const blockers = input.mutations.flatMap(mutationBlockers);
  const duplicates = duplicatePaths(input.mutations);
  blockers.push(...duplicates.map((path) => `contents mutation batch repeats path: ${path}`));

  if (!input.mutations.some((mutation) => executablePlatformPath(mutation.path))) {
    blockers.push("contents mutation batch has no executable platform mutation");
  }

  if (blockers.length > 0) {
    return block(input, blockers, "repair the ordered contents mutation batch before issuing connector writes");
  }

  const ordered = input.mutations.map(toOrderedMutation);
  const concurrencyKey = `${input.lease.branch}:${input.lease.head_sha}:${input.batch_id}`;

  return {
    ...base(input),
    ok: true,
    action: "compile_serial_contents_batch",
    concurrency_key: concurrencyKey,
    ordered_mutations: ordered,
    decisive_evidence: [
      input.batch_id,
      concurrencyKey,
      ...(input.lease.lease_id ? [input.lease.lease_id] : []),
      ...ordered.map((mutation) => `${mutation.sequence}:${mutation.kind}:${mutation.path}`),
      ...input.lease.decisive_evidence,
    ],
    blockers: [],
    next_route: "execute ordered contents mutations serially against the leased head, then compile the write-result receipt",
  };
}
