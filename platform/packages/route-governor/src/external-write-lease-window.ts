export type ExternalWriteLeaseWindowAction =
  | "open_write_window"
  | "execute_within_window"
  | "block_stale_lease_head"
  | "block_expired_lease"
  | "block_unopened_window"
  | "block_branch_mismatch";

export interface ExternalWriteLeaseWindowInput {
  repository_full_name: string;
  pr_number: number;
  branch: string;
  active_branch: string;
  lease_id: string;
  leased_head_sha: string;
  live_head_sha: string;
  issued_at_epoch_ms: number;
  now_epoch_ms: number;
  ttl_ms: number;
  execution_started: boolean;
  planned_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
}

export interface ExternalWriteLeaseWindowVerdict {
  ok: boolean;
  action: ExternalWriteLeaseWindowAction;
  repository_full_name: string;
  pr_number: number;
  branch: string;
  head_sha: string;
  lease_id: string;
  expires_at_epoch_ms: number | null;
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

function base(input: ExternalWriteLeaseWindowInput): Pick<
  ExternalWriteLeaseWindowVerdict,
  "repository_full_name" | "pr_number" | "branch" | "head_sha" | "lease_id" | "expires_at_epoch_ms"
> {
  return {
    repository_full_name: input.repository_full_name,
    pr_number: input.pr_number,
    branch: input.branch,
    head_sha: input.live_head_sha,
    lease_id: input.lease_id,
    expires_at_epoch_ms: Number.isFinite(input.issued_at_epoch_ms + input.ttl_ms)
      ? input.issued_at_epoch_ms + input.ttl_ms
      : null,
  };
}

function block(
  input: ExternalWriteLeaseWindowInput,
  action: Exclude<ExternalWriteLeaseWindowAction, "open_write_window" | "execute_within_window">,
  blockers: string[],
  nextRoute: string,
): ExternalWriteLeaseWindowVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function planBlockers(input: ExternalWriteLeaseWindowInput): string[] {
  const blockers: string[] = [];

  if (!input.lease_id.trim()) blockers.push("write lease window has no lease id");
  if (!Number.isInteger(input.ttl_ms) || input.ttl_ms <= 0) blockers.push("write lease window has no positive ttl");
  if (!Number.isFinite(input.issued_at_epoch_ms)) blockers.push("write lease window has no finite issued-at timestamp");
  if (!Number.isFinite(input.now_epoch_ms)) blockers.push("write lease window has no finite current timestamp");
  if (!input.planned_files.some(executablePlatformPath)) {
    blockers.push("write lease window has no executable platform file");
  }
  if (input.executable_artifacts.length === 0) blockers.push("write lease window has no executable artifact evidence");
  if (input.routing_artifacts.length === 0) blockers.push("write lease window has no routing artifact evidence");
  if (input.proof_artifacts.length === 0) blockers.push("write lease window has no proof artifact evidence");

  return blockers;
}

export function compileExternalWriteLeaseWindow(
  input: ExternalWriteLeaseWindowInput,
): ExternalWriteLeaseWindowVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`write lease window branch ${input.branch} does not match active branch ${input.active_branch}`],
      "rebind the lease window to the active PR branch before execution",
    );
  }

  if (input.leased_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_lease_head",
      [`write lease was issued for ${input.leased_head_sha}, but live head is ${input.live_head_sha}`],
      "refresh the write lease against the live PR head before executing connector writes",
    );
  }

  const blockers = planBlockers(input);
  if (blockers.length > 0) {
    return block(
      input,
      "block_unopened_window",
      blockers,
      "complete the lease-window inputs before opening or executing a write window",
    );
  }

  const expiresAt = input.issued_at_epoch_ms + input.ttl_ms;
  if (input.now_epoch_ms > expiresAt) {
    return block(
      input,
      "block_expired_lease",
      [`write lease ${input.lease_id} expired at ${expiresAt}; current time is ${input.now_epoch_ms}`],
      "refresh the live-head lease before executing branch writes",
    );
  }

  const decisiveEvidence = [
    input.lease_id,
    `leased head ${input.leased_head_sha}`,
    `window expires at ${expiresAt}`,
    ...input.planned_files.filter(executablePlatformPath),
    ...input.executable_artifacts,
    ...input.routing_artifacts,
    ...input.proof_artifacts,
  ];

  if (!input.execution_started) {
    return {
      ...base(input),
      ok: true,
      action: "open_write_window",
      decisive_evidence: decisiveEvidence,
      blockers: [],
      next_route: "execute connector writes before the lease window expires, then require status on the moved head",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "execute_within_window",
    decisive_evidence: decisiveEvidence,
    blockers: [],
    next_route: "complete the branch write now; reject the result if the PR head changes during execution",
  };
}
