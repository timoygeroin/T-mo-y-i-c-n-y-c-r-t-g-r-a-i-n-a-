export type SceneClass =
  | "continuity_recovery"
  | "archive_pressure"
  | "source_ranking"
  | "proof_scene"
  | "finalization_pressure"
  | "self_evolution"
  | "platform_genesis"
  | "manifestation_bridge";

export interface RouteDecision {
  scene_class: SceneClass;
  secondary_classes: SceneClass[];
  organ_chain: string[];
  processor_bundle: string[];
  branch_budget: {
    max_branches: number;
    reason: string;
  };
  collapse_rule: string;
  termination_goal: string;
}

export interface RouteGuardInput {
  decision: RouteDecision;
  source_tiers: string[];
  move_class: string;
  exhausted_move_classes: string[];
  proof_artifacts: string[];
  manifestation_artifacts: string[];
}

export interface RouteGuardVerdict {
  ok: boolean;
  failures: string[];
}

const ACT_OR_BLOCKER_TERMS = ["external durable act", "exact external blocker"];
const MANIFESTATION_TERMS = ["branch", "commit", "externally retrievable artifact"];

export function evaluateRoute(input: RouteGuardInput): RouteGuardVerdict {
  const failures: string[] = [];
  const { decision } = input;

  if (!decision.scene_class) {
    failures.push("route decision has no primary scene class");
  }

  if (decision.secondary_classes.length > 2) {
    failures.push("route decision carries more than two secondary scene classes");
  }

  if (decision.organ_chain.length === 0) {
    failures.push("route decision has no organ chain");
  }

  if (decision.processor_bundle.length === 0) {
    failures.push("route decision has no processor bundle");
  }

  if (!Number.isInteger(decision.branch_budget.max_branches) || decision.branch_budget.max_branches < 1) {
    failures.push("route decision has no positive integer branch budget");
  }

  if (!decision.branch_budget.reason.trim()) {
    failures.push("route decision branch budget has no reason");
  }

  if (input.source_tiers.length === 0) {
    failures.push("route has no source-tier classification");
  }

  if (input.exhausted_move_classes.includes(input.move_class)) {
    failures.push(`move class already exhausted: ${input.move_class}`);
  }

  if (decision.scene_class === "proof_scene" && input.proof_artifacts.length === 0) {
    failures.push("proof scene has no durable evidence surface");
  }

  if (
    decision.scene_class === "finalization_pressure" &&
    !ACT_OR_BLOCKER_TERMS.some((term) => decision.termination_goal.includes(term))
  ) {
    failures.push("finalization route does not terminate in an external act or exact blocker");
  }

  if (
    decision.scene_class === "manifestation_bridge" &&
    !MANIFESTATION_TERMS.every((term) => input.manifestation_artifacts.some((artifact) => artifact.includes(term)))
  ) {
    failures.push("manifestation route lacks branch, commit, or externally retrievable artifact evidence");
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}

export function assertRoute(input: RouteGuardInput): RouteDecision {
  const verdict = evaluateRoute(input);
  if (!verdict.ok) {
    throw new Error(verdict.failures.join("; "));
  }
  return input.decision;
}
