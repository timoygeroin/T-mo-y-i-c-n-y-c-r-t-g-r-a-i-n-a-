export type HeadTransitionReleaseClass = "external_embodiment" | "fresh_status_readback" | "exact_external_blocker";

export interface StoredHeadReceipt {
  receipt_id: string;
  branch: string;
  head_sha: string;
  release_class: HeadTransitionReleaseClass;
}

export interface CandidateHeadTransition {
  branch: string;
  previous_head_sha: string;
  head_sha: string;
  release_class: HeadTransitionReleaseClass;
  changed_files: string[];
  executable_artifacts: string[];
  status_surface_ids: string[];
  blocker?: string;
}

export interface HeadTransitionGuardInput {
  active_branch: string;
  previous_receipts: StoredHeadReceipt[];
  candidate: CandidateHeadTransition;
}

export interface HeadTransitionGuardVerdict {
  ok: boolean;
  action: "accept_head_transition" | "block_head_transition";
  release_class: HeadTransitionReleaseClass | "blocked";
  lineage: string[];
  failures: string[];
  next_route: string;
}

function latestReceiptForBranch(receipts: StoredHeadReceipt[], branch: string): StoredHeadReceipt | null {
  return [...receipts].reverse().find((receipt) => receipt.branch === branch) ?? null;
}

function isExecutablePlatformPath(path: string): boolean {
  return path.startsWith("platform/packages/") && /\.(ts|js|mjs|json)$/.test(path);
}

export function compileHeadTransitionGuard(input: HeadTransitionGuardInput): HeadTransitionGuardVerdict {
  const { active_branch: activeBranch, candidate } = input;
  const latest = latestReceiptForBranch(input.previous_receipts, activeBranch);
  const failures: string[] = [];

  if (candidate.branch !== activeBranch) {
    failures.push(`candidate branch ${candidate.branch} does not match active branch ${activeBranch}`);
  }

  if (latest && candidate.previous_head_sha !== latest.head_sha) {
    failures.push(`candidate previous head ${candidate.previous_head_sha} does not match latest recorded head ${latest.head_sha}`);
  }

  if (candidate.release_class === "external_embodiment") {
    if (candidate.head_sha === candidate.previous_head_sha) {
      failures.push("external embodiment must move the PR head");
    }
    if (!candidate.changed_files.some(isExecutablePlatformPath)) {
      failures.push("external embodiment transition must cite a changed executable platform file");
    }
    if (candidate.executable_artifacts.length === 0) {
      failures.push("external embodiment transition must cite an executable artifact");
    }
  }

  if (candidate.release_class === "fresh_status_readback") {
    if (candidate.head_sha !== candidate.previous_head_sha) {
      failures.push("fresh status readback must bind to the already-current head, not invent a branch move");
    }
    if (candidate.status_surface_ids.length === 0) {
      failures.push("fresh status readback transition must cite a status surface");
    }
  }

  if (candidate.release_class === "exact_external_blocker") {
    if (candidate.head_sha !== candidate.previous_head_sha) {
      failures.push("exact blocker must bind to the current head it blocks");
    }
    if (!candidate.blocker?.trim()) {
      failures.push("exact blocker transition must name the blocker");
    }
  }

  const lineage = latest
    ? [`${latest.head_sha} -> ${candidate.head_sha}`]
    : [`initial -> ${candidate.head_sha}`];

  if (failures.length > 0) {
    return {
      ok: false,
      action: "block_head_transition",
      release_class: "blocked",
      lineage,
      failures,
      next_route: "re-read the active PR head and compile a transition from the latest recorded head before release",
    };
  }

  return {
    ok: true,
    action: "accept_head_transition",
    release_class: candidate.release_class,
    lineage,
    failures,
    next_route:
      candidate.release_class === "external_embodiment"
        ? "record the new head, then require future status claims to bind to it"
        : "continue only from the same recorded head unless a new embodiment commit moves it",
  };
}
