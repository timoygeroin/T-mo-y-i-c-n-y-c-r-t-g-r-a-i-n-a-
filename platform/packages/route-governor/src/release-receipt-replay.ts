export type GuardedReleaseClass = "external_embodiment" | "fresh_status_readback" | "exact_external_blocker";

export interface StoredContinuationReceipt {
  receipt_id: string;
  branch: string;
  head_sha: string;
  release_class: GuardedReleaseClass;
  decisive_evidence: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  status_surface_ids: string[];
  blocker?: string;
}

export interface CandidateContinuationReceipt {
  branch: string;
  head_sha: string;
  release_class: GuardedReleaseClass;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  status_surface_ids: string[];
  status_surface_head_sha?: string;
  blocker?: string;
}

export interface ReceiptReplayGuardInput {
  current_head_sha: string;
  previous_receipts: StoredContinuationReceipt[];
  candidate: CandidateContinuationReceipt;
}

export interface ReceiptReplayGuardVerdict {
  ok: boolean;
  action: "accept_new_receipt" | "block_replayed_receipt";
  progress_class: GuardedReleaseClass | "blocked";
  decisive_evidence: string[];
  failures: string[];
  next_route: string;
}

function latestReceiptForBranch(receipts: StoredContinuationReceipt[], branch: string): StoredContinuationReceipt | null {
  return [...receipts].reverse().find((receipt) => receipt.branch === branch) ?? null;
}

function hasNewItem(candidateItems: string[], previousItems: string[]): boolean {
  const previous = new Set(previousItems);
  return candidateItems.some((item) => !previous.has(item));
}

function isExecutablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

export function compileReceiptReplayGuard(input: ReceiptReplayGuardInput): ReceiptReplayGuardVerdict {
  const { candidate, current_head_sha: currentHeadSha } = input;
  const latest = latestReceiptForBranch(input.previous_receipts, candidate.branch);
  const failures: string[] = [];
  const decisive_evidence: string[] = [];

  if (candidate.head_sha !== currentHeadSha) {
    failures.push(`candidate receipt head ${candidate.head_sha} does not match current PR head ${currentHeadSha}`);
  }

  if (candidate.release_class === "external_embodiment") {
    const changedExecutableFiles = candidate.changed_files.filter(isExecutablePlatformPath);
    const hasNewExecutable = changedExecutableFiles.length > 0 && candidate.executable_artifacts.length > 0;
    const hasNewRoutingArtifact = latest
      ? hasNewItem(candidate.routing_artifacts, latest.routing_artifacts)
      : candidate.routing_artifacts.length > 0;

    if (!hasNewExecutable) {
      failures.push("external embodiment receipt must carry a changed executable platform file and executable artifact");
    }
    if (!hasNewRoutingArtifact) {
      failures.push("external embodiment receipt repeats the previous routing artifact surface");
    }

    decisive_evidence.push(...changedExecutableFiles, ...candidate.executable_artifacts, ...candidate.routing_artifacts);
  }

  if (candidate.release_class === "fresh_status_readback") {
    const hasNewStatusSurface = latest ? hasNewItem(candidate.status_surface_ids, latest.status_surface_ids) : candidate.status_surface_ids.length > 0;

    if (candidate.status_surface_head_sha !== currentHeadSha) {
      failures.push("fresh status readback receipt must be bound to the current PR head");
    }
    if (!hasNewStatusSurface) {
      failures.push("fresh status readback receipt repeats the previous status surface");
    }

    decisive_evidence.push(...candidate.status_surface_ids);
  }

  if (candidate.release_class === "exact_external_blocker") {
    const blocker = candidate.blocker?.trim();
    if (!blocker) {
      failures.push("exact external blocker receipt must name the blocker");
    }
    if (latest?.release_class === "exact_external_blocker" && latest.blocker === blocker && latest.head_sha === candidate.head_sha) {
      failures.push("exact external blocker receipt repeats the previous blocker on the same head");
    }
    if (blocker) decisive_evidence.push(blocker);
  }

  if (latest && latest.head_sha === candidate.head_sha && latest.release_class === candidate.release_class) {
    const hasNewExecutable = hasNewItem(candidate.executable_artifacts, latest.executable_artifacts);
    const hasNewRouting = hasNewItem(candidate.routing_artifacts, latest.routing_artifacts);
    const hasNewStatus = hasNewItem(candidate.status_surface_ids, latest.status_surface_ids);
    const hasNewBlocker = candidate.blocker !== latest.blocker;

    if (!hasNewExecutable && !hasNewRouting && !hasNewStatus && !hasNewBlocker) {
      failures.push("candidate receipt repeats the last receipt without new head, executable artifact, routing artifact, status surface, or blocker");
    }
  }

  if (failures.length > 0) {
    return {
      ok: false,
      action: "block_replayed_receipt",
      progress_class: "blocked",
      decisive_evidence,
      failures,
      next_route: "commit a new executable embodiment, read a new current-head status surface, or name a different exact external blocker",
    };
  }

  return {
    ok: true,
    action: "accept_new_receipt",
    progress_class: candidate.release_class,
    decisive_evidence,
    failures,
    next_route:
      candidate.release_class === "external_embodiment"
        ? "after the branch moves, bind future status receipts to the new head"
        : "continue only with a non-repeated external continuation receipt",
  };
}
