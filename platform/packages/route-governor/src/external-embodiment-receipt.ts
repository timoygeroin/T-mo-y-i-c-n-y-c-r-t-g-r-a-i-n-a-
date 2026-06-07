export type ExternalEmbodimentReceiptAction =
  | "record_embodiment"
  | "record_embodiment_with_status"
  | "block_release";

export type ExternalEmbodimentMoveClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker";

export interface ExternalEmbodimentStatusSurface {
  head_sha: string;
  verdict: "passing" | "passing_with_warnings" | "pending" | "failing" | "no_status_surface";
  evidence_ids: string[];
}

export interface ExternalEmbodimentReceiptInput {
  branch: string;
  active_branch: string;
  previous_head_sha: string;
  new_head_sha: string;
  move_class: ExternalEmbodimentMoveClass;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  spent_move_classes: string[];
  attempted_status_surface?: ExternalEmbodimentStatusSurface;
}

export interface ExternalEmbodimentReceiptVerdict {
  ok: boolean;
  action: ExternalEmbodimentReceiptAction;
  branch: string;
  previous_head_sha: string;
  new_head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function isExecutablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: ExternalEmbodimentReceiptInput): Pick<
  ExternalEmbodimentReceiptVerdict,
  "branch" | "previous_head_sha" | "new_head_sha"
> {
  return {
    branch: input.branch,
    previous_head_sha: input.previous_head_sha,
    new_head_sha: input.new_head_sha,
  };
}

function executableChanged(input: ExternalEmbodimentReceiptInput): boolean {
  return input.changed_files.some(isExecutablePlatformPath) && input.executable_artifacts.length > 0;
}

function statusSurfaceIsUsable(surface: ExternalEmbodimentStatusSurface): boolean {
  return surface.evidence_ids.length > 0 && surface.verdict !== "pending" && surface.verdict !== "no_status_surface";
}

export function compileExternalEmbodimentReceipt(
  input: ExternalEmbodimentReceiptInput,
): ExternalEmbodimentReceiptVerdict {
  const blockers: string[] = [];

  if (input.branch !== input.active_branch) {
    blockers.push(`external embodiment branch ${input.branch} does not match active branch ${input.active_branch}`);
  }

  if (input.move_class !== "external_platform_embodiment") {
    blockers.push(`external embodiment receipt cannot record move class: ${input.move_class}`);
  }

  if (input.spent_move_classes.includes(input.move_class)) {
    blockers.push(`external embodiment move class is already spent: ${input.move_class}`);
  }

  if (input.previous_head_sha === input.new_head_sha) {
    blockers.push("external embodiment did not move the PR head");
  }

  if (!executableChanged(input)) {
    blockers.push("external embodiment has no executable platform change");
  }

  if (input.routing_artifacts.length === 0) {
    blockers.push("external embodiment has no future-routing artifact");
  }

  const status = input.attempted_status_surface;
  if (status) {
    if (status.head_sha !== input.new_head_sha) {
      blockers.push(`attempted status surface belongs to ${status.head_sha}, not new head ${input.new_head_sha}`);
    }
    if (!statusSurfaceIsUsable(status)) {
      blockers.push(`attempted status surface is not complete: ${status.verdict}`);
    }
  }

  if (blockers.length > 0) {
    return {
      ...base(input),
      ok: false,
      action: "block_release",
      decisive_evidence: input.changed_files,
      blockers,
      next_route: "record only a moved-head executable embodiment, then read status bound to the new PR head",
    };
  }

  const decisive_evidence = [
    `head moved from ${input.previous_head_sha} to ${input.new_head_sha}`,
    ...input.changed_files,
    ...input.executable_artifacts,
    ...input.routing_artifacts,
    ...(status ? status.evidence_ids.map((id) => `new-head status evidence ${id}: ${status.verdict}`) : []),
  ];

  return {
    ...base(input),
    ok: true,
    action: status ? "record_embodiment_with_status" : "record_embodiment",
    decisive_evidence,
    blockers: [],
    next_route: status
      ? "status is bound to the moved head; continue only with a non-repeated embodiment class or exact blocker"
      : "read only status surfaces bound to the moved PR head before making a pass/fail status claim",
  };
}
