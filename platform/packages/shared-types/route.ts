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
