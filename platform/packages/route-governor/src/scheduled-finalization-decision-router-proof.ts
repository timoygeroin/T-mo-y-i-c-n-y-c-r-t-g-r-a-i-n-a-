import { compileFailureDetailEscalation, type FailureDetailEscalationVerdict } from "./failure-detail-escalation.js";
import { compileLiveStatusAuthority, type LiveStatusAuthorityVerdict } from "./live-status-authority.js";
import { selectNextEmbodimentIncrement, type NextEmbodimentSelectorVerdict } from "./next-embodiment-selector.js";
import { routeScheduledFinalizationDecision } from "./scheduled-finalization-decision-router.js";
import { rebaseScheduledFinalizationToLiveHead, type ScheduledFinalizationHeadRebaseVerdict } from "./scheduled-finalization-head-rebase.js";

const branch = "monday-platform-genesis-01";
const promptHead = "b38ea247602ae8ebba80c4120ad03b41b26bd841";
const liveHead = "ad11868536b464d53f0fbbfcd42ca6f6abdd72bf";

function expectOk(name: string, ok: boolean, blockers: string[]): void {
  if (!ok) throw new Error(`${name} should pass, blocked by: ${blockers.join("; ")}`);
}

function expectAction(name: string, actual: string, expected: string): void {
  if (actual !== expected) throw new Error(`${name} chose ${actual}, expected ${expected}`);
}

function rebase(overrides: Partial<ScheduledFinalizationHeadRebaseVerdict> = {}): ScheduledFinalizationHeadRebaseVerdict {
  return {
    ok: true,
    action: "admit_live_head_external_embodiment",
    branch,
    admitted_head_sha: liveHead,
    quarantined_head_shas: [promptHead],
    decisive_evidence: [`live head ${liveHead}`, `quarantined prompt head ${promptHead}`],
    blockers: [],
    next_route: "commit the live-head embodiment, then read status only for the moved head",
    ...overrides,
  };
}

function embodiment(): NextEmbodimentSelectorVerdict {
  return selectNextEmbodimentIncrement({
    active_branch: branch,
    live_head_sha: liveHead,
    spent_move_classes: [],
    spent_artifact_classes: [],
    prohibited_move_classes: ["metadata_reread", "duplicate_ci_summary", "old_repaired_head_blocker"],
    candidates: [
      {
        candidate_id: "scheduled-finalization-decision-router",
        branch,
        live_head_sha: liveHead,
        move_class: "external_platform_embodiment",
        artifact_class: "scheduled_finalization_decision_router",
        capability_axis: "runtime_execution",
        changed_files: ["platform/packages/route-governor/src/scheduled-finalization-decision-router.ts"],
        executable_artifacts: ["routeScheduledFinalizationDecision"],
        routing_artifacts: ["scheduled finalization decision router"],
        proof_artifacts: ["platform/packages/route-governor/src/scheduled-finalization-decision-router-proof.ts"],
        compounds_future_runs: true,
        decisive_weight: 9,
      },
    ],
  });
}

function passingStatus(): LiveStatusAuthorityVerdict {
  return compileLiveStatusAuthority({
    branch,
    active_branch: branch,
    live_head_sha: liveHead,
    evidence: [
      {
        surface_id: "check-run-27090000001",
        kind: "check_run",
        head_sha: liveHead,
        verdict: "passing_with_warnings",
        decisive_items: ["Route governor proof examples succeeded"],
        warnings: ["Node.js 20 Actions deprecation notice"],
      },
    ],
  });
}

function failingStatus(): LiveStatusAuthorityVerdict {
  return compileLiveStatusAuthority({
    branch,
    active_branch: branch,
    live_head_sha: liveHead,
    evidence: [
      {
        surface_id: "public-checks-current-head",
        kind: "check_run",
        head_sha: liveHead,
        verdict: "failing",
        decisive_items: ["Run proof examples failed with exit code 1"],
        warnings: ["Node.js 20 Actions deprecation notice"],
      },
    ],
  });
}

function detail(detail_excerpt?: string): FailureDetailEscalationVerdict {
  return compileFailureDetailEscalation({
    branch,
    active_branch: branch,
    live_head_sha: liveHead,
    failing_surface: {
      surface_id: "public-checks-current-head",
      kind: "public_checks_summary",
      head_sha: liveHead,
      check_name: "Monday Platform CI / Route governor proof surface",
      failed_step: "Run proof examples",
      exit_code: 1,
      annotation_count: 1,
      detail_excerpt,
    },
    available_transports: [],
    spent_escalation_signatures: [],
  });
}

export function runScheduledFinalizationDecisionRouterProof(): void {
  const selectedEmbodiment = routeScheduledFinalizationDecision({
    active_branch: branch,
    live_head_sha: liveHead,
    prompt_head_sha: promptHead,
    rebase: rebase(),
    embodiment: embodiment(),
    prohibited_release_classes: ["metadata_reread", "duplicate_ci_summary", "old_repaired_head_blocker"],
  });
  expectOk("embodiment route", selectedEmbodiment.ok, selectedEmbodiment.blockers);
  expectAction("embodiment route", selectedEmbodiment.action, "route_to_external_embodiment");
  if (selectedEmbodiment.quarantined_prompt_head !== promptHead) {
    throw new Error("embodiment route did not quarantine the prompt-carried repaired head");
  }

  const readback = routeScheduledFinalizationDecision({
    active_branch: branch,
    live_head_sha: liveHead,
    prompt_head_sha: promptHead,
    rebase: rebase({ action: "admit_live_head_status_readback" }),
    live_status: passingStatus(),
    prohibited_release_classes: ["metadata_reread", "duplicate_ci_summary", "old_repaired_head_blocker"],
  });
  expectOk("live status route", readback.ok, readback.blockers);
  expectAction("live status route", readback.action, "route_to_live_status_readback");

  const needsDetail = routeScheduledFinalizationDecision({
    active_branch: branch,
    live_head_sha: liveHead,
    prompt_head_sha: promptHead,
    rebase: rebase(),
    live_status: failingStatus(),
    failure_detail: detail(),
    prohibited_release_classes: ["metadata_reread", "duplicate_ci_summary", "old_repaired_head_blocker"],
  });
  expectAction("missing failure detail route", needsDetail.action, "route_to_exact_blocker");
  if (!needsDetail.blockers.some((blocker) => blocker.includes("no actionable assertion"))) {
    throw new Error(`missing detail route did not preserve exact blocker: ${needsDetail.blockers.join("; ")}`);
  }

  const repair = routeScheduledFinalizationDecision({
    active_branch: branch,
    live_head_sha: liveHead,
    prompt_head_sha: promptHead,
    rebase: rebase(),
    live_status: failingStatus(),
    failure_detail: detail("AssertionError: expected route_to_external_embodiment"),
    prohibited_release_classes: ["metadata_reread", "duplicate_ci_summary", "old_repaired_head_blocker"],
  });
  expectOk("failure detail repair route", repair.ok, repair.blockers);
  expectAction("failure detail repair route", repair.action, "route_to_failure_detail");

  const staleRebase = routeScheduledFinalizationDecision({
    active_branch: branch,
    live_head_sha: liveHead,
    prompt_head_sha: promptHead,
    rebase: rebase({ admitted_head_sha: promptHead }),
    embodiment: embodiment(),
    prohibited_release_classes: [],
  });
  expectAction("stale rebase route", staleRebase.action, "block_scheduled_finalization");
}

runScheduledFinalizationDecisionRouterProof();
