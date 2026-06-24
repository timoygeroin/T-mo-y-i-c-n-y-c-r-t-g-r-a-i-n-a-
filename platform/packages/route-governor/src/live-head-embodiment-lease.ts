export type LiveHeadEmbodimentLeaseStatus = "passing" | "passing_with_warnings" | "pending" | "failing" | "missing";

export type LiveHeadEmbodimentLeaseAction =
  | "admit_live_head_embodiment_lease"
  | "block_branch_mismatch"
  | "block_stale_base_head"
  | "block_missing_status_lease"
  | "block_stale_status_lease"
  | "block_unready_status_lease"
  | "block_replayed_lease"
  | "block_non_executable_write"
  | "block_missing_routing_effect"
  | "block_spent_write_signature";

export interface LiveHeadStatusLeaseEvidence {
  lease_id: string;
  branch: string;
  head_sha: string;
  status: LiveHeadEmbodimentLeaseStatus;
  evidence: string[];
}

export interface LiveHeadEmbodimentWritePlan {
  plan_id: string;
  branch: string;
  base_head_sha: string;
  changed_files: string[];
  behavior_exports: string[];
  routing_effects: string[];
  write_signature?: string;
}

export interface LiveHeadEmbodimentLeaseInput {
  active_branch: string;
  live_head_sha: string;
  repaired_historical_heads: string[];
  spent_lease_ids: string[];
  spent_write_signatures: string[];
  status_lease?: LiveHeadStatusLeaseEvidence;
  write_plan: LiveHeadEmbodimentWritePlan;
}

export interface LiveHeadEmbodimentLeaseVerdict {
  ok: boolean;
  action: LiveHeadEmbodimentLeaseAction;
  branch: string;
  head_sha: string;
  lease_id: string | null;
  plan_id: string;
  admitted_write_signature: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executableBehaviorPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/route-governor/src/") &&
    /\.(?:ts|js|mjs)$/.test(path) &&
    !/(?:\.test|-proof)\.ts$/.test(path) &&
    !path.endsWith("/index.ts")
  );
}

function normalize(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function currentStatusReady(status: LiveHeadEmbodimentLeaseStatus): boolean {
  return status === "passing" || status === "passing_with_warnings";
}

function base(input: LiveHeadEmbodimentLeaseInput): Pick<
  LiveHeadEmbodimentLeaseVerdict,
  "branch" | "head_sha" | "plan_id" | "lease_id"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    plan_id: input.write_plan.plan_id,
    lease_id: input.status_lease?.lease_id ?? null,
  };
}

function block(
  input: LiveHeadEmbodimentLeaseInput,
  action: Exclude<LiveHeadEmbodimentLeaseAction, "admit_live_head_embodiment_lease">,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): LiveHeadEmbodimentLeaseVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_write_signature: null,
    decisive_evidence: evidence,
    blockers,
    next_route: nextRoute,
  };
}

export function admitLiveHeadEmbodimentLease(input: LiveHeadEmbodimentLeaseInput): LiveHeadEmbodimentLeaseVerdict {
  const plan = input.write_plan;
  const writeSignature = normalize(plan.write_signature);

  if (plan.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`write plan branch ${plan.branch} does not match active branch ${input.active_branch}`],
      "bind the embodiment write plan to the active PR branch before writing",
      plan.changed_files,
    );
  }

  if (plan.base_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_base_head",
      [`write plan base ${plan.base_head_sha} does not match live head ${input.live_head_sha}`],
      "refresh the write plan against the live PR head before writing",
      plan.changed_files,
    );
  }

  if (input.repaired_historical_heads.includes(plan.base_head_sha)) {
    return block(
      input,
      "block_stale_base_head",
      [`write plan is based on repaired historical head ${plan.base_head_sha}`],
      "discard repaired-head authority and rebase the write plan on the live PR head",
      plan.changed_files,
    );
  }

  const lease = input.status_lease;
  if (!lease) {
    return block(
      input,
      "block_missing_status_lease",
      [`no status lease supplied for live head ${input.live_head_sha}`],
      "obtain or compile current-head status authority before admitting another embodiment write",
      plan.changed_files,
    );
  }

  if (lease.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`status lease branch ${lease.branch} does not match active branch ${input.active_branch}`],
      "bind status authority to the active PR branch before consuming it",
      lease.evidence,
    );
  }

  if (lease.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status_lease",
      [`status lease ${lease.lease_id} belongs to ${lease.head_sha}, not ${input.live_head_sha}`],
      "discard stale status authority and lease the live-head status surface",
      lease.evidence,
    );
  }

  if (input.spent_lease_ids.includes(lease.lease_id)) {
    return block(
      input,
      "block_replayed_lease",
      [`status lease already spent: ${lease.lease_id}`],
      "compile a fresh live-head lease before admitting another write plan",
      lease.evidence,
    );
  }

  if (!currentStatusReady(lease.status)) {
    return block(
      input,
      "block_unready_status_lease",
      [`status lease ${lease.lease_id} is ${lease.status}`],
      "repair, wait for, or exact-block on the live-head status surface before writing",
      lease.evidence,
    );
  }

  if (writeSignature && input.spent_write_signatures.includes(writeSignature)) {
    return block(
      input,
      "block_spent_write_signature",
      [`write signature already spent: ${writeSignature}`],
      "choose a semantically new executable embodiment write plan",
      [writeSignature],
    );
  }

  const executableFiles = plan.changed_files.filter(executableBehaviorPath);
  if (executableFiles.length === 0 || plan.behavior_exports.length === 0) {
    return block(
      input,
      "block_non_executable_write",
      ["write plan does not contain executable behavior-bearing route-governor source and export"],
      "add behavior-bearing source plus an exported behavior before admitting the write",
      plan.changed_files,
    );
  }

  if (plan.routing_effects.length === 0) {
    return block(
      input,
      "block_missing_routing_effect",
      ["write plan has no future-routing effect"],
      "name the future-routing effect before admitting the write",
      plan.changed_files,
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_live_head_embodiment_lease",
    admitted_write_signature: writeSignature,
    decisive_evidence: [
      `status lease ${lease.lease_id}`,
      `status head ${lease.head_sha}`,
      `write plan ${plan.plan_id}`,
      ...(writeSignature ? [`write signature ${writeSignature}`] : []),
      ...lease.evidence,
      ...executableFiles,
      ...plan.behavior_exports,
      ...plan.routing_effects,
    ],
    blockers: [],
    next_route: "commit the admitted executable write, then open post-write status escrow for the moved PR head",
  };
}
