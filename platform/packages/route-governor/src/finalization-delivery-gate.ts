import type {
  ScheduledFinalizationDeliveryTarget,
  ScheduledFinalizationEmissionClass,
  ScheduledFinalizationRunnerOutput,
} from "./finalization-runner.js";

export type FinalizationDeliveryGateAction =
  | "publish_external_embodiment_to_pr"
  | "publish_live_head_status_to_pr"
  | "publish_exact_blocker_to_pr"
  | "block_chat_only_progress"
  | "block_non_progress_delivery"
  | "block_wrong_pr"
  | "block_wrong_branch";

export interface FinalizationDeliveryGateInput {
  runner_output: ScheduledFinalizationRunnerOutput;
  active_pr: number;
  target_pr: number;
  active_branch: string;
  target_branch: string;
  allowed_delivery_targets: ScheduledFinalizationDeliveryTarget[];
}

export interface FinalizationDeliveryGateVerdict {
  ok: boolean;
  action: FinalizationDeliveryGateAction;
  branch: string;
  head_sha: string;
  delivery_target: ScheduledFinalizationDeliveryTarget;
  emission_class: ScheduledFinalizationEmissionClass;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const PR_BOUND_EMISSIONS = new Set<ScheduledFinalizationEmissionClass>([
  "external_embodiment",
  "live_head_status_readback",
  "exact_external_blocker",
]);

function base(input: FinalizationDeliveryGateInput): Pick<
  FinalizationDeliveryGateVerdict,
  "branch" | "head_sha" | "delivery_target" | "emission_class"
> {
  return {
    branch: input.runner_output.branch,
    head_sha: input.runner_output.head_sha,
    delivery_target: input.runner_output.delivery_target,
    emission_class: input.runner_output.emission_class,
  };
}

function block(
  input: FinalizationDeliveryGateInput,
  action: Extract<
    FinalizationDeliveryGateAction,
    "block_chat_only_progress" | "block_non_progress_delivery" | "block_wrong_pr" | "block_wrong_branch"
  >,
  blockers: string[],
  nextRoute: string,
): FinalizationDeliveryGateVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function publishAction(emission: ScheduledFinalizationEmissionClass): FinalizationDeliveryGateAction {
  switch (emission) {
    case "external_embodiment":
      return "publish_external_embodiment_to_pr";
    case "live_head_status_readback":
      return "publish_live_head_status_to_pr";
    case "exact_external_blocker":
      return "publish_exact_blocker_to_pr";
    case "blocked_non_progress":
    case "blocked_incomplete_progress":
      return "block_non_progress_delivery";
  }
}

export function gateFinalizationDelivery(input: FinalizationDeliveryGateInput): FinalizationDeliveryGateVerdict {
  const output = input.runner_output;

  if (input.target_branch !== input.active_branch || output.branch !== input.active_branch) {
    return block(
      input,
      "block_wrong_branch",
      [`delivery branch ${input.target_branch} / runner branch ${output.branch} does not match active branch ${input.active_branch}`],
      "retarget delivery to the active PR branch before publishing finalization output",
    );
  }

  if (input.target_pr !== input.active_pr) {
    return block(
      input,
      "block_wrong_pr",
      [`delivery target PR #${input.target_pr} does not match active PR #${input.active_pr}`],
      "retarget delivery to the active manifestation PR before publishing finalization output",
    );
  }

  if (!input.allowed_delivery_targets.includes(output.delivery_target)) {
    return block(
      input,
      "block_chat_only_progress",
      [`delivery target ${output.delivery_target} is not allowed for this finalization surface`],
      "bind the scheduled finalization emission to the active PR surface",
    );
  }

  if (!output.ok || !PR_BOUND_EMISSIONS.has(output.emission_class)) {
    return block(
      input,
      "block_non_progress_delivery",
      output.payload.blockers.length > 0 ? output.payload.blockers : [`runner emission is not publishable progress: ${output.emission_class}`],
      "repair the runner verdict or emit one exact PR-bound blocker",
    );
  }

  if (output.delivery_target !== "github_pr") {
    return block(
      input,
      "block_chat_only_progress",
      [`${output.emission_class} cannot be completed through ${output.delivery_target}; active sink is PR #${input.active_pr}`],
      "publish the emission to the active GitHub PR or block it as non-progress",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: publishAction(output.emission_class),
    decisive_evidence: [
      `PR #${input.active_pr}`,
      input.active_branch,
      output.summary,
      ...output.payload.decisive_evidence,
    ],
    blockers: [],
    next_route: "after PR-bound delivery moves the branch or publishes evidence, read only surfaces bound to the resulting live head",
  };
}
