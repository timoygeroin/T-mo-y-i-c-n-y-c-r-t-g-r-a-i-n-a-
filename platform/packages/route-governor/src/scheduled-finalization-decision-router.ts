import type { FailureDetailEscalationVerdict } from "./failure-detail-escalation.js";
import type { LiveStatusAuthorityVerdict } from "./live-status-authority.js";
import type { NextEmbodimentSelectorVerdict } from "./next-embodiment-selector.js";
import type { ScheduledFinalizationHeadRebaseVerdict } from "./scheduled-finalization-head-rebase.js";

export type ScheduledFinalizationDecisionAction =
  | "route_to_external_embodiment"
  | "route_to_live_status_readback"
  | "route_to_failure_detail"
  | "route_to_exact_blocker"
  | "block_scheduled_finalization";

export interface ScheduledFinalizationDecisionRouterInput {
  active_branch: string;
  live_head_sha: string;
  prompt_head_sha: string;
  rebase: ScheduledFinalizationHeadRebaseVerdict;
  live_status?: LiveStatusAuthorityVerdict;
  failure_detail?: FailureDetailEscalationVerdict;
  embodiment?: NextEmbodimentSelectorVerdict;
  prohibited_release_classes: string[];
}

export interface ScheduledFinalizationDecisionRouterVerdict {
  ok: boolean;
  action: ScheduledFinalizationDecisionAction;
  branch: string;
  head_sha: string;
  quarantined_prompt_head: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function base(input: ScheduledFinalizationDecisionRouterInput): Pick<
  ScheduledFinalizationDecisionRouterVerdict,
  "branch" | "head_sha" | "quarantined_prompt_head"
> {
  return {
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    quarantined_prompt_head: input.prompt_head_sha === input.live_head_sha ? null : input.prompt_head_sha,
  };
}

function block(
  input: ScheduledFinalizationDecisionRouterInput,
  blockers: string[],
  nextRoute: string,
): ScheduledFinalizationDecisionRouterVerdict {
  return {
    ...base(input),
    ok: false,
    action: "block_scheduled_finalization",
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

function prohibits(input: ScheduledFinalizationDecisionRouterInput, releaseClass: string): boolean {
  return input.prohibited_release_classes.includes(releaseClass);
}

function directStatusIsActionable(status: LiveStatusAuthorityVerdict): boolean {
  return status.action === "repair_live_failure" || status.action === "accept_live_status_evidence";
}

export function routeScheduledFinalizationDecision(
  input: ScheduledFinalizationDecisionRouterInput,
): ScheduledFinalizationDecisionRouterVerdict {
  if (input.rebase.branch !== input.active_branch || input.rebase.admitted_head_sha !== input.live_head_sha) {
    return block(
      input,
      [
        `rebase verdict targets ${input.rebase.branch}@${input.rebase.admitted_head_sha}, not ${input.active_branch}@${input.live_head_sha}`,
      ],
      "rebase scheduled finalization to the live PR head before choosing a route",
    );
  }

  if (!input.rebase.ok) {
    return block(
      input,
      input.rebase.blockers.length > 0 ? input.rebase.blockers : ["scheduled finalization rebase did not admit a route"],
      input.rebase.next_route,
    );
  }

  if (input.live_status && input.live_status.branch !== input.active_branch) {
    return block(input, input.live_status.blockers, "discard status authority from the wrong branch");
  }

  if (input.live_status && input.live_status.head_sha !== input.live_head_sha) {
    return block(
      input,
      [`status authority targets ${input.live_status.head_sha}, not live head ${input.live_head_sha}`],
      "discard stale status authority before scheduled finalization release",
    );
  }

  if (input.live_status && directStatusIsActionable(input.live_status)) {
    if (input.live_status.action === "repair_live_failure") {
      if (input.failure_detail?.ok && input.failure_detail.action === "repair_from_detail") {
        return {
          ...base(input),
          ok: true,
          action: "route_to_failure_detail",
          decisive_evidence: [...input.live_status.decisive_evidence, ...input.failure_detail.decisive_evidence],
          blockers: [],
          next_route: "repair only the detailed live-head failure, then require moved-head status readback",
        };
      }

      return {
        ...base(input),
        ok: false,
        action: "route_to_exact_blocker",
        decisive_evidence: input.live_status.decisive_evidence,
        blockers: input.failure_detail?.blockers.length
          ? input.failure_detail.blockers
          : ["live-head failure is known but no actionable failure detail is attached"],
        next_route: input.failure_detail?.next_route ?? "obtain current-head failure detail before editing code",
      };
    }

    if (prohibits(input, "fresh_status_readback")) {
      return block(input, ["fresh_status_readback is prohibited for this scheduled route"], "choose a new embodiment route");
    }

    return {
      ...base(input),
      ok: true,
      action: "route_to_live_status_readback",
      decisive_evidence: input.live_status.decisive_evidence,
      blockers: [],
      next_route: "publish the live-head status readback, then choose a non-repeated embodiment",
    };
  }

  if (input.embodiment?.ok && input.embodiment.selected) {
    if (prohibits(input, input.embodiment.selected.artifact_class)) {
      return block(
        input,
        [`embodiment artifact class is prohibited: ${input.embodiment.selected.artifact_class}`],
        "select an unspent embodiment artifact class before moving the branch",
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "route_to_external_embodiment",
      decisive_evidence: input.embodiment.selected.decisive_evidence,
      blockers: [],
      next_route: "commit the selected embodiment and bind the next readback to the moved head",
    };
  }

  if (input.live_status && !input.live_status.ok) {
    return {
      ...base(input),
      ok: false,
      action: "route_to_exact_blocker",
      decisive_evidence: input.live_status.decisive_evidence,
      blockers: input.live_status.blockers,
      next_route: input.live_status.next_route,
    };
  }

  return block(
    input,
    ["no live status, failure detail, or selectable embodiment survived scheduled finalization routing"],
    "supply one live-head status surface, one actionable failure detail, one selectable embodiment, or one exact blocker",
  );
}
