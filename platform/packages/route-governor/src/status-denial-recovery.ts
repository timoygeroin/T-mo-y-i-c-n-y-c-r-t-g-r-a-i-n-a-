export type StatusDenialSurfaceKind = "checks_api" | "commit_status_api" | "pull_request_checks_page" | "workflow_run_log";

export type StatusDenialReason = "http_403" | "not_exposed_by_connector" | "network_denied" | "missing_status_reader";

export type StatusDenialRecoveryAction =
  | "admit_denial_recovery_embodiment"
  | "route_to_status_readback"
  | "emit_status_denial_blocker"
  | "block_stale_denial"
  | "block_repeated_denial"
  | "block_known_live_failure"
  | "block_incomplete_candidate"
  | "block_branch_mismatch";

export interface StatusDenialReceipt {
  receipt_id: string;
  surface_kind: StatusDenialSurfaceKind;
  branch: string;
  head_sha: string;
  reason: StatusDenialReason;
  detail: string;
}

export interface StatusDenialRecoveryCandidate {
  candidate_id: string;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
}

export interface StatusDenialRecoveryInput {
  branch: string;
  active_branch: string;
  live_head_sha: string;
  last_status_readback_head_sha: string;
  writable_external_surface: boolean;
  known_live_failures: string[];
  status_denials: StatusDenialReceipt[];
  spent_denial_receipt_ids: string[];
  spent_artifact_classes: string[];
  candidate?: StatusDenialRecoveryCandidate;
}

export interface StatusDenialRecoveryVerdict {
  ok: boolean;
  action: StatusDenialRecoveryAction;
  branch: string;
  head_sha: string;
  status_claim: "none" | "requires_live_readback";
  admitted_candidate_id: string | null;
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

function base(input: StatusDenialRecoveryInput): Pick<StatusDenialRecoveryVerdict, "branch" | "head_sha"> {
  return { branch: input.branch, head_sha: input.live_head_sha };
}

function block(
  input: StatusDenialRecoveryInput,
  action: Exclude<
    StatusDenialRecoveryAction,
    "admit_denial_recovery_embodiment" | "route_to_status_readback" | "emit_status_denial_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): StatusDenialRecoveryVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    status_claim: "none",
    admitted_candidate_id: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

function receiptEvidence(receipt: StatusDenialReceipt): string {
  return `${receipt.receipt_id}:${receipt.surface_kind}:${receipt.reason}:${receipt.head_sha}`;
}

function liveDenials(input: StatusDenialRecoveryInput): StatusDenialReceipt[] {
  return input.status_denials.filter(
    (receipt) => receipt.branch === input.active_branch && receipt.head_sha === input.live_head_sha,
  );
}

function staleDenials(input: StatusDenialRecoveryInput): StatusDenialReceipt[] {
  return input.status_denials.filter(
    (receipt) => receipt.branch !== input.active_branch || receipt.head_sha !== input.live_head_sha,
  );
}

function candidateBlockers(input: StatusDenialRecoveryInput): string[] {
  const candidate = input.candidate;
  if (!candidate) return ["status denial recovery has no embodiment candidate"];

  const blockers: string[] = [];

  if (!candidate.candidate_id.trim()) blockers.push("status denial recovery candidate has no candidate id");
  if (!candidate.artifact_class.trim()) blockers.push("status denial recovery candidate has no artifact class");
  if (input.spent_artifact_classes.includes(candidate.artifact_class)) {
    blockers.push(`status denial recovery repeats spent artifact class: ${candidate.artifact_class}`);
  }
  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("status denial recovery candidate changes no executable platform file");
  }
  if (candidate.executable_artifacts.length === 0) {
    blockers.push("status denial recovery candidate has no executable artifact evidence");
  }
  if (candidate.routing_artifacts.length === 0) {
    blockers.push("status denial recovery candidate has no future-routing artifact evidence");
  }
  if (candidate.proof_artifacts.length === 0) {
    blockers.push("status denial recovery candidate has no proof artifact evidence");
  }

  return blockers;
}

function candidateEvidence(candidate: StatusDenialRecoveryCandidate): string[] {
  return [
    candidate.candidate_id,
    candidate.artifact_class,
    ...candidate.changed_files.filter(executablePlatformPath),
    ...candidate.executable_artifacts,
    ...candidate.routing_artifacts,
    ...candidate.proof_artifacts,
  ];
}

export function recoverFromStatusDenial(input: StatusDenialRecoveryInput): StatusDenialRecoveryVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`status denial recovery branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind status-denial recovery to the active PR branch before release",
    );
  }

  if (input.known_live_failures.length > 0) {
    return block(
      input,
      "block_known_live_failure",
      input.known_live_failures,
      "repair the known live-head failure before using status-denial recovery",
    );
  }

  const live = liveDenials(input);
  const stale = staleDenials(input);

  if (live.length === 0) {
    return block(
      input,
      "block_stale_denial",
      stale.length > 0
        ? stale.map((receipt) => `stale status denial cannot authorize recovery: ${receiptEvidence(receipt)}`)
        : [`no live-head status denial receipt exists for ${input.live_head_sha}`],
      "obtain a live-head status surface or a live-head status-denial receipt before choosing recovery",
      stale.map(receiptEvidence),
    );
  }

  const repeated = live.filter((receipt) => input.spent_denial_receipt_ids.includes(receipt.receipt_id));
  if (repeated.length > 0) {
    return block(
      input,
      "block_repeated_denial",
      repeated.map((receipt) => `status denial receipt already spent: ${receipt.receipt_id}`),
      "do not reuse the same status-denial receipt as a new progress trigger",
      repeated.map(receiptEvidence),
    );
  }

  const candidateFailures = candidateBlockers(input);
  if (candidateFailures.length > 0) {
    if (!input.writable_external_surface) {
      return {
        ...base(input),
        ok: false,
        action: "emit_status_denial_blocker",
        status_claim: "requires_live_readback",
        admitted_candidate_id: null,
        decisive_evidence: live.map(receiptEvidence),
        blockers: [
          "live-head status readback is denied and no writable embodiment surface is available",
          ...candidateFailures,
        ],
        next_route: "obtain a live-head Checks or Actions surface, or restore a writable external embodiment surface",
      };
    }

    return block(
      input,
      "block_incomplete_candidate",
      candidateFailures,
      "supply a complete non-repeated executable embodiment candidate before recovering from status denial",
      live.map(receiptEvidence),
    );
  }

  const candidate = input.candidate;
  if (!candidate) {
    return block(
      input,
      "block_incomplete_candidate",
      ["status denial recovery has no embodiment candidate"],
      "supply a complete non-repeated executable embodiment candidate before recovering from status denial",
      live.map(receiptEvidence),
    );
  }

  if (!input.writable_external_surface) {
    return {
      ...base(input),
      ok: false,
      action: "emit_status_denial_blocker",
      status_claim: "requires_live_readback",
      admitted_candidate_id: null,
      decisive_evidence: live.map(receiptEvidence),
      blockers: ["live-head status readback is denied and no writable embodiment surface is available"],
      next_route: "obtain a live-head Checks or Actions surface, or restore a writable external embodiment surface",
    };
  }

  const headMovedSinceReadback = input.live_head_sha !== input.last_status_readback_head_sha;

  return {
    ...base(input),
    ok: true,
    action: headMovedSinceReadback ? "admit_denial_recovery_embodiment" : "route_to_status_readback",
    status_claim: "none",
    admitted_candidate_id: candidate.candidate_id,
    decisive_evidence: [
      ...(headMovedSinceReadback
        ? [`head moved from ${input.last_status_readback_head_sha} to ${input.live_head_sha}`]
        : [`head has not moved beyond last status readback ${input.last_status_readback_head_sha}`]),
      ...live.map(receiptEvidence),
      ...live.map((receipt) => receipt.detail).filter((detail) => detail.trim().length > 0),
      ...candidateEvidence(candidate),
    ],
    blockers: [],
    next_route: headMovedSinceReadback
      ? "commit the no-status-claim denial-recovery embodiment, then require status readback for the moved head"
      : "read live-head status before using denial recovery as an embodiment trigger",
  };
}
