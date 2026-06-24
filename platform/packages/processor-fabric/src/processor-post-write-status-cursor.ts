export type ProcessorPostWriteStatusAction =
  | "open_processor_post_write_status_cursor"
  | "admit_processor_post_write_status"
  | "emit_processor_post_write_blocker"
  | "block_missing_cursor_id"
  | "block_reused_cursor"
  | "block_branch_mismatch"
  | "block_unmoved_head"
  | "block_incomplete_write_receipt"
  | "block_stale_status_surface"
  | "block_status_surface_without_success";

export interface ProcessorPostWriteStatusSurface {
  head_sha: string;
  ok: boolean;
  decisive_successes: string[];
  blocking_failures: string[];
  pending_surfaces: string[];
  non_blocking_warnings: string[];
}

export interface ProcessorPostWriteStatusCursorInput {
  cursor_id: string;
  active_branch: string;
  receipt_branch: string;
  pre_write_head_sha: string;
  post_write_head_sha: string;
  changed_files: string[];
  behavior_exports: string[];
  proof_artifacts: string[];
  spent_cursor_ids: string[];
  status_surface?: ProcessorPostWriteStatusSurface;
}

export interface ProcessorPostWriteStatusCursorVerdict {
  ok: boolean;
  action: ProcessorPostWriteStatusAction;
  cursor_id: string | null;
  branch: string;
  head_sha: string;
  quarantined_head_shas: string[];
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

function clean(value: string): string {
  return value.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function executableProcessorPath(path: string): boolean {
  return path.startsWith("platform/packages/processor-fabric/") && /\.(ts|js|mjs|json)$/.test(path);
}

function behaviorProcessorPath(path: string): boolean {
  return executableProcessorPath(path) && !/(?:\.test|-proof)\.ts$/.test(path) && !path.endsWith("package.json");
}

function base(input: ProcessorPostWriteStatusCursorInput): Pick<
  ProcessorPostWriteStatusCursorVerdict,
  "cursor_id" | "branch" | "head_sha" | "quarantined_head_shas"
> {
  return {
    cursor_id: clean(input.cursor_id) || null,
    branch: input.active_branch,
    head_sha: input.post_write_head_sha,
    quarantined_head_shas: unique([
      input.pre_write_head_sha !== input.post_write_head_sha ? input.pre_write_head_sha : "",
    ]),
  };
}

function writeEvidence(input: ProcessorPostWriteStatusCursorInput): string[] {
  return unique([
    `cursor ${input.cursor_id || "<missing>"}`,
    `branch ${input.active_branch}`,
    `pre-write head ${input.pre_write_head_sha || "<missing>"}`,
    `post-write head ${input.post_write_head_sha || "<missing>"}`,
    ...input.changed_files,
    ...input.behavior_exports,
    ...input.proof_artifacts,
  ]);
}

function block(
  input: ProcessorPostWriteStatusCursorInput,
  action: Exclude<
    ProcessorPostWriteStatusAction,
    "open_processor_post_write_status_cursor" | "admit_processor_post_write_status" | "emit_processor_post_write_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): ProcessorPostWriteStatusCursorVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: unique(evidence),
    blockers: unique(blockers),
    warnings: input.status_surface?.non_blocking_warnings ?? [],
    next_route: nextRoute,
  };
}

function writeReceiptBlockers(input: ProcessorPostWriteStatusCursorInput): string[] {
  const blockers: string[] = [];

  if (!input.changed_files.some(executableProcessorPath)) {
    blockers.push("processor post-write cursor has no executable processor-fabric file");
  }
  if (!input.changed_files.some(behaviorProcessorPath)) {
    blockers.push("processor post-write cursor has no behavior-bearing processor-fabric file");
  }
  if (input.behavior_exports.length === 0) blockers.push("processor post-write cursor has no behavior export");
  if (input.proof_artifacts.length === 0) blockers.push("processor post-write cursor has no proof artifact");

  return blockers;
}

export function routeProcessorPostWriteStatusCursor(
  input: ProcessorPostWriteStatusCursorInput,
): ProcessorPostWriteStatusCursorVerdict {
  const cursorId = clean(input.cursor_id);
  const evidence = writeEvidence(input);

  if (!cursorId) {
    return block(input, "block_missing_cursor_id", ["processor post-write status cursor has no id"], "mint a cursor id before post-write status custody", evidence);
  }

  if (input.spent_cursor_ids.includes(cursorId)) {
    return block(input, "block_reused_cursor", [`processor post-write status cursor already spent: ${cursorId}`], "open a fresh cursor for the new post-write head", evidence);
  }

  if (input.receipt_branch !== input.active_branch) {
    return block(input, "block_branch_mismatch", [`write receipt branch ${input.receipt_branch} is not ${input.active_branch}`], "bind post-write status custody to the active PR branch", evidence);
  }

  if (!clean(input.post_write_head_sha) || clean(input.pre_write_head_sha) === clean(input.post_write_head_sha)) {
    return block(input, "block_unmoved_head", ["processor post-write cursor requires a new post-write head"], "write an embodiment commit before opening status custody", evidence);
  }

  const receiptBlockers = writeReceiptBlockers(input);
  if (receiptBlockers.length > 0) {
    return block(input, "block_incomplete_write_receipt", receiptBlockers, "attach processor behavior and proof evidence before status custody", evidence);
  }

  const status = input.status_surface;
  if (!status) {
    return {
      ...base(input),
      ok: true,
      action: "open_processor_post_write_status_cursor",
      decisive_evidence: evidence,
      blockers: [],
      warnings: [],
      next_route: "read status only for the post-write head; do not reuse pre-write checks as progress",
    };
  }

  if (status.head_sha !== input.post_write_head_sha) {
    return block(
      input,
      "block_stale_status_surface",
      [`status surface belongs to ${status.head_sha}, not post-write head ${input.post_write_head_sha}`],
      "discard stale status and read checks for the post-write head",
      [...evidence, `status head ${status.head_sha}`],
    );
  }

  if (!status.ok) {
    const blockers = unique([...status.blocking_failures, ...status.pending_surfaces]);
    return {
      ...base(input),
      ok: false,
      action: "emit_processor_post_write_blocker",
      decisive_evidence: unique([...evidence, ...status.decisive_successes]),
      blockers: blockers.length > 0 ? blockers : [`post-write status for ${input.post_write_head_sha} is not passing`],
      warnings: status.non_blocking_warnings,
      next_route: "repair or wait on the post-write status surface before downstream review or merge authority",
    };
  }

  if (status.decisive_successes.length === 0) {
    return block(
      input,
      "block_status_surface_without_success",
      ["passing post-write status surface has no decisive success evidence"],
      "attach named successful checks before admitting status custody",
      evidence,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_processor_post_write_status",
    decisive_evidence: unique([...evidence, ...status.decisive_successes]),
    blockers: [],
    warnings: status.non_blocking_warnings,
    next_route: "post-write processor status is head-bound; downstream review or merge authority may consume this cursor once",
  };
}
