export type LiveProgressReceiptMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker";

export type LiveProgressReceiptAction =
  | "accept_external_progress_receipt"
  | "accept_status_receipt"
  | "accept_blocker_receipt"
  | "block_stale_receipt_head"
  | "block_unmoved_embodiment"
  | "block_incomplete_receipt"
  | "block_repeated_move_class"
  | "block_branch_mismatch";

export interface LiveProgressReceiptInput {
  branch: string;
  active_branch: string;
  receipt_id: string;
  move_class: LiveProgressReceiptMoveClass;
  live_head_before: string;
  receipt_base_head: string;
  resulting_head: string;
  next_status_expected_head?: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  status_surfaces: string[];
  exact_blocker?: string;
  exhausted_move_classes: string[];
}

export interface LiveProgressReceiptVerdict {
  ok: boolean;
  action: LiveProgressReceiptAction;
  branch: string;
  head_sha: string;
  next_status_expected_head: string | null;
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

function base(input: LiveProgressReceiptInput): Pick<
  LiveProgressReceiptVerdict,
  "branch" | "head_sha" | "next_status_expected_head"
> {
  return {
    branch: input.branch,
    head_sha: input.resulting_head,
    next_status_expected_head: input.next_status_expected_head ?? null,
  };
}

function block(
  input: LiveProgressReceiptInput,
  action: Exclude<LiveProgressReceiptAction, "accept_external_progress_receipt" | "accept_status_receipt" | "accept_blocker_receipt">,
  blockers: string[],
  nextRoute: string,
): LiveProgressReceiptVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function requiredReceiptBlockers(input: LiveProgressReceiptInput): string[] {
  const blockers: string[] = [];
  if (!input.receipt_id.trim()) blockers.push("live progress receipt has no receipt id");
  if (!input.live_head_before.trim()) blockers.push("live progress receipt has no live head before the move");
  if (!input.receipt_base_head.trim()) blockers.push("live progress receipt has no base head");
  if (!input.resulting_head.trim()) blockers.push("live progress receipt has no resulting head");
  return blockers;
}

export function compileLiveProgressReceipt(input: LiveProgressReceiptInput): LiveProgressReceiptVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`live progress receipt branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind the progress receipt to the active manifestation branch before release",
    );
  }

  const missing = requiredReceiptBlockers(input);
  if (missing.length > 0) {
    return block(input, "block_incomplete_receipt", missing, "complete the live progress receipt before release");
  }

  if (input.exhausted_move_classes.includes(input.move_class)) {
    return block(
      input,
      "block_repeated_move_class",
      [`live progress receipt repeats exhausted move class: ${input.move_class}`],
      "choose a non-repeated move class before writing a continuation receipt",
    );
  }

  if (input.receipt_base_head !== input.live_head_before) {
    return block(
      input,
      "block_stale_receipt_head",
      [`receipt base ${input.receipt_base_head} does not match live head ${input.live_head_before}`],
      "discard the stale receipt and restart from the live PR head",
    );
  }

  if (input.move_class === "external_platform_embodiment") {
    const blockers: string[] = [];
    if (input.resulting_head === input.live_head_before) {
      blockers.push("external embodiment receipt did not move the live PR head");
    }
    if (input.next_status_expected_head !== input.resulting_head) {
      blockers.push("external embodiment receipt does not bind the next status readback to the resulting head");
    }
    if (!input.changed_files.some(executablePlatformPath)) {
      blockers.push("external embodiment receipt has no executable platform file change");
    }
    if (input.executable_artifacts.length === 0) {
      blockers.push("external embodiment receipt has no executable artifact evidence");
    }
    if (input.routing_artifacts.length === 0) {
      blockers.push("external embodiment receipt has no future-routing artifact evidence");
    }

    if (blockers.length > 0) {
      return block(input, "block_unmoved_embodiment", blockers, "write a moved-head executable embodiment receipt");
    }

    return {
      ...base(input),
      ok: true,
      action: "accept_external_progress_receipt",
      decisive_evidence: [
        input.receipt_id,
        `base ${input.receipt_base_head}`,
        `result ${input.resulting_head}`,
        ...input.changed_files.filter(executablePlatformPath),
        ...input.executable_artifacts,
        ...input.routing_artifacts,
      ],
      blockers: [],
      next_route: "read status for the resulting head before claiming checks or release readiness",
    };
  }

  if (input.move_class === "fresh_status_readback") {
    if (input.status_surfaces.length === 0) {
      return block(
        input,
        "block_incomplete_receipt",
        ["fresh status receipt has no status surface evidence"],
        "attach live-head status evidence before counting a readback receipt",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "accept_status_receipt",
      decisive_evidence: [input.receipt_id, ...input.status_surfaces],
      blockers: [],
      next_route: "choose a non-repeated executable embodiment or exact blocker from the status verdict",
    };
  }

  if (!input.exact_blocker?.trim()) {
    return block(
      input,
      "block_incomplete_receipt",
      ["exact blocker receipt has no blocker text"],
      "emit only a concrete blocker bound to the live head",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "accept_blocker_receipt",
    decisive_evidence: [input.receipt_id, input.exact_blocker],
    blockers: [],
    next_route: "resolve the exact blocker or wait for new live-head evidence before continuing",
  };
}
