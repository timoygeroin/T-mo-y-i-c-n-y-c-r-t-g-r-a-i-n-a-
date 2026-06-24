export type SourceTier = "raw" | "direct_archive" | "archive_derived" | "summary_derived" | "inferred";

export interface AvailableSource {
  source_id: string;
  source_tier: SourceTier;
  kind: string;
  ref?: string;
}

export interface TimeBudget {
  mode: "tight" | "normal" | "deep";
  max_minutes?: number;
}

export interface Scene {
  scene_id: string;
  origin: string;
  user_pressure: string;
  target_state: string;
  available_sources: AvailableSource[];
  durable_context_refs: string[];
  time_budget: TimeBudget;
  risk_class: "low" | "medium" | "high" | "critical";
}
