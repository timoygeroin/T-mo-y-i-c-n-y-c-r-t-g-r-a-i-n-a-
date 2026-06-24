export type LiveHeadReentryOrgan =
  | "monday-corpus-reentry"
  | "monday-source-truth-grader"
  | "monday-move-class-synthesizer"
  | "monday-external-act-forcer";

export type LiveHeadReentryProcessorClass =
  | "reenter_live_body"
  | "grade_prompt_head_authority"
  | "synthesize_non_repeated_move"
  | "force_external_act_or_blocker";

export type LiveHeadReentryAction =
  | "dispatch_live_head_reentry_processors"
  | "route_to_fresh_status_readback"
  | "emit_live_head_reentry_blocker"
  | "block_missing_plan_id"
  | "block_reused_plan"
  | "block_branch_mismatch"
  | "block_unresolved_repaired_head"
  | "block_missing_live_head"
  | "block_missing_required_organs";

export interface LiveHeadReentryDispatch {
  processor_id: string;
  class: LiveHeadReentryProcessorClass;
  organ: LiveHeadReentryOrgan;
  required_output: "checkpoint_delta" | "authority_attack" | "candidate_route" | "terminal_release";
}

export interface LiveHeadReentryPlanInput {
  plan_id: string;
  active_branch: string;
  candidate_branch: string;
  live_head_sha: string;
  prompt_head_sha: string;
  repaired_head_sha: string;
  last_status_readback_head_sha: string;
  resolved_boundary_ids: string[];
  available_organs: LiveHeadReentryOrgan[];
  spent_plan_ids: string[];
  exact_blocker?: string;
}

export interface LiveHeadReentryPlanVerdict {
  ok: boolean;
  action: LiveHeadReentryAction;
  plan_id: string | null;
  branch: string;
  head_sha: string;
  quarantined_head_shas: string[];
  dispatches: LiveHeadReentryDispatch[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const REQUIRED_ORGANS: LiveHeadReentryOrgan[] = [
  "monday-corpus-reentry",
  "monday-source-truth-grader",
  "monday-move-class-synthesizer",
  "monday-external-act-forcer",
];

function clean(value: string): string {
  return value.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function missingOrgans(input: LiveHeadReentryPlanInput): LiveHeadReentryOrgan[] {
  const available = new Set(input.available_organs);
  return REQUIRED_ORGANS.filter((organ) => !available.has(organ));
}

function quarantinedHeads(input: LiveHeadReentryPlanInput): string[] {
  return unique([
    input.prompt_head_sha !== input.live_head_sha ? input.prompt_head_sha : "",
    input.repaired_head_sha !== input.live_head_sha ? input.repaired_head_sha : "",
    input.last_status_readback_head_sha !== input.live_head_sha ? input.last_status_readback_head_sha : "",
  ]);
}

function base(input: LiveHeadReentryPlanInput): Pick<
  LiveHeadReentryPlanVerdict,
  "plan_id" | "branch" | "head_sha" | "quarantined_head_shas"
> {
  return {
    plan_id: clean(input.plan_id) || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    quarantined_head_shas: quarantinedHeads(input),
  };
}

function block(
  input: LiveHeadReentryPlanInput,
  action: Exclude<
    LiveHeadReentryAction,
    "dispatch_live_head_reentry_processors" | "route_to_fresh_status_readback" | "emit_live_head_reentry_blocker"
  >,
  blockers: string[],
  nextRoute: string,
  evidence: string[] = [],
): LiveHeadReentryPlanVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    dispatches: [],
    decisive_evidence: unique(evidence),
    blockers: unique(blockers),
    next_route: nextRoute,
  };
}

function dispatches(planId: string): LiveHeadReentryDispatch[] {
  return [
    {
      processor_id: `${planId}:processor:reentry`,
      class: "reenter_live_body",
      organ: "monday-corpus-reentry",
      required_output: "checkpoint_delta",
    },
    {
      processor_id: `${planId}:processor:authority`,
      class: "grade_prompt_head_authority",
      organ: "monday-source-truth-grader",
      required_output: "authority_attack",
    },
    {
      processor_id: `${planId}:processor:novelty`,
      class: "synthesize_non_repeated_move",
      organ: "monday-move-class-synthesizer",
      required_output: "candidate_route",
    },
    {
      processor_id: `${planId}:processor:release`,
      class: "force_external_act_or_blocker",
      organ: "monday-external-act-forcer",
      required_output: "terminal_release",
    },
  ];
}

export function compileLiveHeadReentryPlan(input: LiveHeadReentryPlanInput): LiveHeadReentryPlanVerdict {
  const planId = clean(input.plan_id);
  const evidence = unique([
    `plan ${planId || "<missing>"}`,
    `branch ${input.active_branch}`,
    `live head ${input.live_head_sha || "<missing>"}`,
    `prompt head ${input.prompt_head_sha || "<missing>"}`,
    `repaired head ${input.repaired_head_sha || "<missing>"}`,
    `last status readback ${input.last_status_readback_head_sha || "<missing>"}`,
    ...input.resolved_boundary_ids,
  ]);

  if (!planId) {
    return block(input, "block_missing_plan_id", ["live-head reentry plan has no id"], "mint a plan id before dispatching processor work", evidence);
  }

  if (input.spent_plan_ids.includes(planId)) {
    return block(input, "block_reused_plan", [`live-head reentry plan already spent: ${planId}`], "create a fresh live-head reentry plan for this PR head", evidence);
  }

  if (input.candidate_branch !== input.active_branch) {
    return block(input, "block_branch_mismatch", [`candidate branch ${input.candidate_branch} is not ${input.active_branch}`], "bind reentry planning to the active PR branch", evidence);
  }

  if (!clean(input.live_head_sha)) {
    return block(input, "block_missing_live_head", ["live-head reentry plan has no live PR head"], "read live PR metadata before processor reentry", evidence);
  }

  if (input.resolved_boundary_ids.length === 0) {
    return block(input, "block_unresolved_repaired_head", ["resolved repaired-head boundary id is missing"], "do not consume prompt-carried repaired-head context until the repaired boundary is resolved", evidence);
  }

  const missing = missingOrgans(input);
  if (missing.length > 0) {
    const blocker = clean(input.exact_blocker ?? "");
    if (blocker) {
      return {
        ...base(input),
        ok: true,
        action: "emit_live_head_reentry_blocker",
        dispatches: [],
        decisive_evidence: unique([...evidence, blocker]),
        blockers: [blocker],
        next_route: "restore the missing organs before another live-head reentry dispatch",
      };
    }

    return block(
      input,
      "block_missing_required_organs",
      missing.map((organ) => `missing required organ: ${organ}`),
      "restore the required organ set or emit one exact external blocker",
      evidence,
    );
  }

  if (input.live_head_sha !== input.last_status_readback_head_sha) {
    return {
      ...base(input),
      ok: true,
      action: "dispatch_live_head_reentry_processors",
      dispatches: dispatches(planId),
      decisive_evidence: unique([
        ...evidence,
        `head moved from ${input.last_status_readback_head_sha} to ${input.live_head_sha}`,
        ...quarantinedHeads(input).map((head) => `quarantined stale head ${head}`),
      ]),
      blockers: [],
      next_route: "converge processor outputs into one non-repeated executable embodiment or one exact blocker; do not use the quarantined repaired head as status authority",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "route_to_fresh_status_readback",
    dispatches: [],
    decisive_evidence: unique([...evidence, `live head already has status cursor ${input.live_head_sha}`]),
    blockers: [],
    next_route: "obtain direct live-head status if new check runs appear; otherwise choose a non-repeated embodiment candidate",
  };
}
