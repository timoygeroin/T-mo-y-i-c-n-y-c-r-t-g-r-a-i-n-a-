import type { GithubContentsExecutorVerdict, GithubContentsOperation } from "./github-contents-executor.js";
import {
  advanceRouteContinuationState,
  type RouteContinuationState,
  type RouteStateStatusClaim,
  type RouteStateTransitionVerdict,
} from "./route-state-transition.js";

export type GithubContentsResultReceiptAction =
  | "accept_contents_result_receipt"
  | "block_executor_not_writable"
  | "block_branch_or_head_mismatch"
  | "block_missing_write_result"
  | "block_unmatched_write_result"
  | "block_unmoved_head";

export interface GithubContentsWriteResult {
  mutation_id: string;
  path: string;
  commit_sha: string;
  html_url?: string;
}

export interface GithubContentsResultReceiptInput {
  executor: GithubContentsExecutorVerdict;
  active_branch: string;
  pre_write_head_sha: string;
  final_head_sha: string;
  write_results: GithubContentsWriteResult[];
}

export interface GithubContentsResultReceiptVerdict {
  ok: boolean;
  action: GithubContentsResultReceiptAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  previous_head_sha: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  required_status_head_sha: string;
  next_route: string;
}

export type GithubContentsContinuationStateAction = "advance_contents_receipt_state" | "block_contents_receipt_state";

export interface GithubContentsContinuationStateInput {
  receipt: GithubContentsResultReceiptVerdict;
  active_branch: string;
  artifact_class: string;
  spent_artifact_classes: string[];
  spent_move_classes: string[];
  committed_files?: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  status_claim?: RouteStateStatusClaim;
  status_readback_head_sha?: string;
}

export interface GithubContentsContinuationStateVerdict {
  ok: boolean;
  action: GithubContentsContinuationStateAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  previous_head_sha: string;
  head_sha: string;
  next_state: RouteContinuationState;
  decisive_evidence: string[];
  blockers: string[];
  required_status_head_sha: string;
  next_route: string;
}

function base(input: GithubContentsResultReceiptInput): Pick<
  GithubContentsResultReceiptVerdict,
  "repository_full_name" | "pr_number" | "branch" | "previous_head_sha" | "head_sha" | "required_status_head_sha"
> {
  return {
    repository_full_name: input.executor.repository_full_name,
    pr_number: input.executor.pr_number,
    branch: input.executor.branch,
    previous_head_sha: input.pre_write_head_sha,
    head_sha: input.final_head_sha,
    required_status_head_sha: input.final_head_sha,
  };
}

function block(
  input: GithubContentsResultReceiptInput,
  action: Exclude<GithubContentsResultReceiptAction, "accept_contents_result_receipt">,
  blockers: string[],
  nextRoute: string,
): GithubContentsResultReceiptVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function resultKey(result: GithubContentsWriteResult): string {
  return `${result.mutation_id}:${result.path}`;
}

function operationKey(operation: GithubContentsOperation): string {
  return `${operation.mutation_id}:${operation.path}`;
}

function executableOperation(operation: GithubContentsOperation): boolean {
  return (
    operation.path.startsWith("platform/packages/") &&
    (operation.path.endsWith(".ts") ||
      operation.path.endsWith(".js") ||
      operation.path.endsWith(".mjs") ||
      operation.path.endsWith(".json"))
  );
}

function missingResults(operations: GithubContentsOperation[], results: GithubContentsWriteResult[]): string[] {
  const resultKeys = new Set(results.map(resultKey));
  return operations.filter((operation) => !resultKeys.has(operationKey(operation))).map(operationKey);
}

function unmatchedResults(operations: GithubContentsOperation[], results: GithubContentsWriteResult[]): string[] {
  const operationKeys = new Set(operations.map(operationKey));
  return results.filter((result) => !operationKeys.has(resultKey(result))).map(resultKey);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function receiptCommittedFiles(receipt: GithubContentsResultReceiptVerdict, committedFiles: string[] = []): string[] {
  const receiptFiles = receipt.decisive_evidence.flatMap((entry) => {
    const match = /^(?:create_file|update_file):(platform\/packages\/.+)$/.exec(entry);
    return match ? [match[1]] : [];
  });

  return unique([...committedFiles, ...receiptFiles]);
}

function blockedContinuationState(
  input: GithubContentsContinuationStateInput,
  blockers: string[],
  nextRoute: string,
): GithubContentsContinuationStateVerdict {
  const receipt = input.receipt;
  return {
    ok: false,
    action: "block_contents_receipt_state",
    repository_full_name: receipt.repository_full_name,
    pr_number: receipt.pr_number,
    branch: receipt.branch,
    previous_head_sha: receipt.previous_head_sha,
    head_sha: receipt.head_sha,
    next_state: {
      repository_full_name: receipt.repository_full_name,
      pr_number: receipt.pr_number,
      branch: receipt.branch,
      head_sha: receipt.head_sha,
      spent_artifact_classes: unique(input.spent_artifact_classes),
      spent_move_classes: unique(input.spent_move_classes),
      required_status_head_sha: null,
      status_cursor: "blocked",
      blockers,
    },
    decisive_evidence: [],
    blockers,
    required_status_head_sha: receipt.required_status_head_sha,
    next_route: nextRoute,
  };
}

export function compileGithubContentsResultReceipt(
  input: GithubContentsResultReceiptInput,
): GithubContentsResultReceiptVerdict {
  if (!input.executor.ok || input.executor.action !== "execute_github_contents_writes") {
    return block(
      input,
      "block_executor_not_writable",
      input.executor.blockers.length > 0 ? input.executor.blockers : [`executor action is not a contents write: ${input.executor.action}`],
      "complete an executable GitHub contents executor plan before accepting write results",
    );
  }

  if (input.executor.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_or_head_mismatch",
      [`result branch ${input.executor.branch} does not match active branch ${input.active_branch}`],
      "bind the write result receipt to the active PR branch",
    );
  }

  if (input.executor.head_sha !== input.pre_write_head_sha) {
    return block(
      input,
      "block_branch_or_head_mismatch",
      [`executor expected head ${input.executor.head_sha} does not match pre-write head ${input.pre_write_head_sha}`],
      "discard write results that were not planned from the current pre-write head",
    );
  }

  const operations = input.executor.operations;
  const missing = missingResults(operations, input.write_results);
  if (missing.length > 0) {
    return block(
      input,
      "block_missing_write_result",
      missing.map((key) => `missing GitHub contents write result for ${key}`),
      "wait for every contents operation to return its resulting commit SHA before opening a status cursor",
    );
  }

  const unmatched = unmatchedResults(operations, input.write_results);
  if (unmatched.length > 0) {
    return block(
      input,
      "block_unmatched_write_result",
      unmatched.map((key) => `write result has no planned operation: ${key}`),
      "drop unplanned write results or rebuild the executor plan from the actual operations",
    );
  }

  if (input.pre_write_head_sha === input.final_head_sha) {
    return block(
      input,
      "block_unmoved_head",
      [`GitHub contents writes did not move branch head from ${input.pre_write_head_sha}`],
      "do not count the embodiment until the external branch head changes",
    );
  }

  const finalResult = input.write_results.at(-1);
  if (!finalResult || finalResult.commit_sha !== input.final_head_sha) {
    return block(
      input,
      "block_unmatched_write_result",
      [
        finalResult
          ? `final write result ${finalResult.commit_sha} does not match final head ${input.final_head_sha}`
          : "no final write result is available",
      ],
      "read the branch head after contents writes and bind the receipt to the final returned commit",
    );
  }

  const executableWrites = operations.filter(executableOperation).map((operation) => `${operation.method}:${operation.path}`);

  return {
    ...base(input),
    ok: true,
    action: "accept_contents_result_receipt",
    decisive_evidence: [
      `head moved from ${input.pre_write_head_sha} to ${input.final_head_sha}`,
      ...input.write_results.map((result) => `result ${result.mutation_id}:${result.commit_sha}`),
      ...executableWrites,
      ...input.executor.decisive_evidence,
    ],
    blockers: [],
    next_route: "read only status surfaces bound to the final GitHub contents commit before making any pass/fail claim",
  };
}

export function compileGithubContentsContinuationState(
  input: GithubContentsContinuationStateInput,
): GithubContentsContinuationStateVerdict {
  const receipt = input.receipt;

  if (!receipt.ok || receipt.action !== "accept_contents_result_receipt") {
    return blockedContinuationState(
      input,
      receipt.blockers.length > 0 ? receipt.blockers : [`receipt action is not accepted: ${receipt.action}`],
      "accept the GitHub contents result receipt before advancing continuation state",
    );
  }

  if (receipt.branch !== input.active_branch) {
    return blockedContinuationState(
      input,
      [`receipt branch ${receipt.branch} does not match active branch ${input.active_branch}`],
      "bind the continuation state to the active PR branch before release",
    );
  }

  if (!input.artifact_class.trim()) {
    return blockedContinuationState(
      input,
      ["contents continuation state has no artifact class"],
      "name the new artifact class before advancing continuation state",
    );
  }

  const transition: RouteStateTransitionVerdict = advanceRouteContinuationState({
    repository_full_name: receipt.repository_full_name,
    pr_number: receipt.pr_number,
    branch: receipt.branch,
    active_branch: input.active_branch,
    previous_head_sha: receipt.previous_head_sha,
    current_head_sha: receipt.head_sha,
    move_class: "external_platform_embodiment",
    artifact_class: input.artifact_class,
    spent_artifact_classes: input.spent_artifact_classes,
    spent_move_classes: input.spent_move_classes,
    committed_files: receiptCommittedFiles(receipt, input.committed_files),
    executable_artifacts: input.executable_artifacts,
    routing_artifacts: input.routing_artifacts,
    proof_artifacts: input.proof_artifacts,
    status_claim: input.status_claim ?? "none",
    status_readback_head_sha: input.status_readback_head_sha,
  });

  if (!transition.ok) {
    return blockedContinuationState(input, transition.blockers, transition.next_route);
  }

  return {
    ok: true,
    action: "advance_contents_receipt_state",
    repository_full_name: receipt.repository_full_name,
    pr_number: receipt.pr_number,
    branch: receipt.branch,
    previous_head_sha: receipt.previous_head_sha,
    head_sha: receipt.head_sha,
    next_state: transition.next_state,
    decisive_evidence: [...receipt.decisive_evidence, ...transition.decisive_evidence],
    blockers: [],
    required_status_head_sha: transition.next_state.required_status_head_sha ?? receipt.required_status_head_sha,
    next_route: `open status cursor for ${receipt.head_sha}; do not treat the contents commit as a status verdict`,
  };
}
