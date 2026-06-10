export type RouteProgressKind =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "current_head_repair"
  | "exact_external_blocker"
  | "warning_maintenance";

export type RouteProgressLedgerAction =
  | "accept_next_progress_receipt"
  | "block_stale_receipt_head"
  | "block_replayed_receipt"
  | "block_incomplete_receipt";

export interface RouteProgressReceipt {
  receipt_id: string;
  branch: string;
  head_sha: string;
  progress_kind: RouteProgressKind;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  status_surface_ids: string[];
  blocker?: string;
}

export interface RouteProgressLedgerInput {
  branch: string;
  live_head_sha: string;
  receipts: RouteProgressReceipt[];
  candidate: RouteProgressReceipt;
  spent_artifact_classes: string[];
}

export interface RouteProgressLedgerVerdict {
  ok: boolean;
  action: RouteProgressLedgerAction;
  branch: string;
  head_sha: string;
  accepted_receipt_id: string | null;
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

function sameProgressSurface(left: RouteProgressReceipt, right: RouteProgressReceipt): boolean {
  return (
    left.progress_kind === right.progress_kind &&
    left.artifact_class === right.artifact_class &&
    left.head_sha === right.head_sha &&
    left.executable_artifacts.join("\n") === right.executable_artifacts.join("\n") &&
    left.routing_artifacts.join("\n") === right.routing_artifacts.join("\n") &&
    left.status_surface_ids.join("\n") === right.status_surface_ids.join("\n") &&
    (left.blocker ?? "") === (right.blocker ?? "")
  );
}

function base(input: RouteProgressLedgerInput): Pick<RouteProgressLedgerVerdict, "branch" | "head_sha"> {
  return { branch: input.branch, head_sha: input.live_head_sha };
}

function block(
  input: RouteProgressLedgerInput,
  action: Exclude<RouteProgressLedgerAction, "accept_next_progress_receipt">,
  blockers: string[],
  nextRoute: string,
): RouteProgressLedgerVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    accepted_receipt_id: null,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function requiredReceiptBlockers(input: RouteProgressLedgerInput): string[] {
  const { candidate } = input;
  const blockers: string[] = [];

  if (candidate.branch !== input.branch) {
    blockers.push(`candidate branch ${candidate.branch} does not match active branch ${input.branch}`);
  }
  if (candidate.head_sha !== input.live_head_sha) {
    blockers.push(`candidate head ${candidate.head_sha} does not match live head ${input.live_head_sha}`);
  }
  if (!candidate.receipt_id.trim()) blockers.push("candidate has no receipt id");
  if (!candidate.artifact_class.trim()) blockers.push("candidate has no artifact class");

  if (candidate.progress_kind === "fresh_status_readback" && candidate.status_surface_ids.length === 0) {
    blockers.push("fresh status readback receipt has no status surface id");
  }

  if (candidate.progress_kind === "exact_external_blocker" && !candidate.blocker?.trim()) {
    blockers.push("exact external blocker receipt has no blocker text");
  }

  if (
    candidate.progress_kind === "external_platform_embodiment" ||
    candidate.progress_kind === "current_head_repair" ||
    candidate.progress_kind === "warning_maintenance"
  ) {
    if (!candidate.changed_files.some(executablePlatformPath)) {
      blockers.push("candidate has no executable platform file change");
    }
    if (candidate.executable_artifacts.length === 0) blockers.push("candidate has no executable artifact evidence");
    if (candidate.routing_artifacts.length === 0) blockers.push("candidate has no future-routing artifact evidence");
    if (candidate.proof_artifacts.length === 0) blockers.push("candidate has no proof artifact evidence");
  }

  return blockers;
}

export function compileRouteProgressLedger(input: RouteProgressLedgerInput): RouteProgressLedgerVerdict {
  const candidateBlockers = requiredReceiptBlockers(input);
  if (candidateBlockers.some((candidateBlocker) => candidateBlocker.includes("does not match"))) {
    return block(input, "block_stale_receipt_head", candidateBlockers, "bind the progress receipt to the live PR branch and head");
  }

  if (candidateBlockers.length > 0) {
    return block(input, "block_incomplete_receipt", candidateBlockers, "complete the progress receipt before it can steer future routing");
  }

  const repeatedReceiptId = input.receipts.find((receipt) => receipt.receipt_id === input.candidate.receipt_id);
  if (repeatedReceiptId) {
    return block(
      input,
      "block_replayed_receipt",
      [`receipt id already exists in ledger: ${input.candidate.receipt_id}`],
      "write a new receipt id for the next real progress event",
    );
  }

  const replayedSurface = input.receipts.find((receipt) => sameProgressSurface(receipt, input.candidate));
  if (replayedSurface) {
    return block(
      input,
      "block_replayed_receipt",
      [`candidate replays prior receipt surface: ${replayedSurface.receipt_id}`],
      "change the executable behavior, status surface, or blocker before counting progress",
    );
  }

  if (input.spent_artifact_classes.includes(input.candidate.artifact_class)) {
    return block(
      input,
      "block_replayed_receipt",
      [`artifact class is already spent: ${input.candidate.artifact_class}`],
      "choose an unspent artifact class before appending the route progress ledger",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_next_progress_receipt",
    accepted_receipt_id: input.candidate.receipt_id,
    decisive_evidence: [
      input.candidate.receipt_id,
      input.candidate.progress_kind,
      input.candidate.artifact_class,
      ...input.candidate.changed_files.filter(executablePlatformPath),
      ...input.candidate.executable_artifacts,
      ...input.candidate.routing_artifacts,
      ...input.candidate.proof_artifacts,
      ...input.candidate.status_surface_ids,
      ...(input.candidate.blocker ? [input.candidate.blocker] : []),
    ],
    blockers: [],
    next_route: "append the accepted receipt, then require the next run to route from the updated live-head ledger",
  };
}
