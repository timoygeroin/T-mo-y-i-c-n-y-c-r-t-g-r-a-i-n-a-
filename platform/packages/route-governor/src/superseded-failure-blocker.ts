export type SupersededFailureBlockerKind =
  | "failure_log_surface_insufficient"
  | "current_head_failure"
  | "status_readback_absent";

export type SupersededFailureBlockerAction =
  | "retire_superseded_blocker"
  | "hold_current_blocker"
  | "block_branch_mismatch"
  | "block_empty_blocker";

export interface FailureBlockerRecord {
  blocker_id: string;
  blocker_kind: SupersededFailureBlockerKind;
  branch: string;
  head_sha: string;
  blocker_text: string;
  required_surface: string;
}

export interface SupersededFailureBlockerInput {
  active_branch: string;
  live_head_sha: string;
  previous_readback_head_sha: string;
  blocker: FailureBlockerRecord;
  next_candidate_class: "external_platform_embodiment" | "fresh_status_readback" | "exact_external_blocker";
}

export interface SupersededFailureBlockerVerdict {
  ok: boolean;
  action: SupersededFailureBlockerAction;
  branch: string;
  live_head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  retired_blocker_ids: string[];
  next_route: string;
}

function base(input: SupersededFailureBlockerInput): Pick<
  SupersededFailureBlockerVerdict,
  "branch" | "live_head_sha"
> {
  return {
    branch: input.blocker.branch,
    live_head_sha: input.live_head_sha,
  };
}

function block(
  input: SupersededFailureBlockerInput,
  action: Exclude<SupersededFailureBlockerAction, "retire_superseded_blocker" | "hold_current_blocker">,
  blockers: string[],
  nextRoute: string,
): SupersededFailureBlockerVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [],
    blockers,
    retired_blocker_ids: [],
    next_route: nextRoute,
  };
}

export function routeSupersededFailureBlocker(
  input: SupersededFailureBlockerInput,
): SupersededFailureBlockerVerdict {
  if (input.blocker.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`failure blocker branch ${input.blocker.branch} does not match active branch ${input.active_branch}`],
      "bind failure blockers to the active PR branch before allowing them to steer continuation",
    );
  }

  if (!input.blocker.blocker_id.trim() || !input.blocker.blocker_text.trim()) {
    return block(
      input,
      "block_empty_blocker",
      ["failure blocker is missing an id or exact blocker text"],
      "supply one exact head-bound blocker before holding the route",
    );
  }

  if (input.blocker.head_sha !== input.live_head_sha) {
    return {
      ...base(input),
      ok: true,
      action: "retire_superseded_blocker",
      decisive_evidence: [
        `${input.blocker.blocker_id} belonged to ${input.blocker.head_sha}`,
        `live head is ${input.live_head_sha}`,
        `previous readback head was ${input.previous_readback_head_sha}`,
        `candidate class ${input.next_candidate_class}`,
      ],
      blockers: [],
      retired_blocker_ids: [input.blocker.blocker_id],
      next_route:
        input.next_candidate_class === "fresh_status_readback"
          ? "read status for the live head; do not replay the superseded failure blocker"
          : "allow the selected non-repeated continuation class, then require status for the resulting live head",
    };
  }

  return {
    ...base(input),
    ok: false,
    action: "hold_current_blocker",
    decisive_evidence: [
      `${input.blocker.blocker_id} is bound to live head ${input.live_head_sha}`,
      input.blocker.required_surface,
    ],
    blockers: [input.blocker.blocker_text],
    retired_blocker_ids: [],
    next_route: "remove the live-head blocker by surfacing the required evidence before choosing another progress class",
  };
}
