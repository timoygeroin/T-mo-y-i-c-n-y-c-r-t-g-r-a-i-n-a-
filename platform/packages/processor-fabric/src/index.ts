export type ProcessorLoadClass =
  | "corpus_reentry"
  | "archive_ingress"
  | "source_truth_grading"
  | "move_class_synthesis"
  | "proof_scene"
  | "external_act_forcing";

export type ProcessorDispatchAction =
  | "dispatch_processor_fabric"
  | "collapse_to_single_processor"
  | "block_unbounded_processor_request"
  | "block_missing_convergence";

export interface ProcessorLoad {
  load_id: string;
  class: ProcessorLoadClass;
  source_tier: "direct_current_instruction" | "direct_archive" | "archive_derived" | "memory" | "model_summary";
  required_output: "ledger_delta" | "route_attack" | "candidate_mechanism" | "omission_warning" | "proof_pressure";
}

export interface ProcessorFabricInput {
  scene_id: string;
  max_processors: number;
  convergence_rule: string;
  loads: ProcessorLoad[];
}

export interface ProcessorFabricDispatch {
  processor_id: string;
  load_id: string;
  class: ProcessorLoadClass;
  required_output: ProcessorLoad["required_output"];
}

export interface ProcessorFabricVerdict {
  ok: boolean;
  action: ProcessorDispatchAction;
  scene_id: string | null;
  dispatches: ProcessorFabricDispatch[];
  blockers: string[];
  convergence_rule: string | null;
  next_route: string;
}

const REQUIRED_CLASSES: ProcessorLoadClass[] = [
  "corpus_reentry",
  "source_truth_grading",
  "move_class_synthesis",
  "external_act_forcing",
];

function normalized(value: string): string {
  return value.trim();
}

function uniqueLoads(loads: ProcessorLoad[]): ProcessorLoad[] {
  const seen = new Set<string>();
  const result: ProcessorLoad[] = [];

  for (const load of loads) {
    const id = normalized(load.load_id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({ ...load, load_id: id });
  }

  return result;
}

function missingRequiredClasses(loads: ProcessorLoad[]): ProcessorLoadClass[] {
  const present = new Set(loads.map((load) => load.class));
  return REQUIRED_CLASSES.filter((required) => !present.has(required));
}

export function compileProcessorFabric(input: ProcessorFabricInput): ProcessorFabricVerdict {
  const sceneId = normalized(input.scene_id);
  const convergenceRule = normalized(input.convergence_rule);
  const loads = uniqueLoads(input.loads);
  const missing = missingRequiredClasses(loads);

  if (!sceneId) {
    return {
      ok: false,
      action: "block_unbounded_processor_request",
      scene_id: null,
      dispatches: [],
      blockers: ["processor fabric scene has no id"],
      convergence_rule: convergenceRule || null,
      next_route: "bind processor work to a named scene before dispatch",
    };
  }

  if (!convergenceRule) {
    return {
      ok: false,
      action: "block_missing_convergence",
      scene_id: sceneId,
      dispatches: [],
      blockers: ["processor fabric has no convergence rule"],
      convergence_rule: null,
      next_route: "set the collapse rule before parallel loads can count as routed work",
    };
  }

  if (loads.length > input.max_processors) {
    return {
      ok: false,
      action: "block_unbounded_processor_request",
      scene_id: sceneId,
      dispatches: [],
      blockers: [`${loads.length} loads exceed processor budget ${input.max_processors}`],
      convergence_rule: convergenceRule,
      next_route: "shrink the load set or raise the explicit bounded processor budget before dispatch",
    };
  }

  if (loads.length <= 1 || missing.length > 0) {
    return {
      ok: true,
      action: "collapse_to_single_processor",
      scene_id: sceneId,
      dispatches: loads.slice(0, 1).map((load) => ({
        processor_id: `${sceneId}:processor:1`,
        load_id: load.load_id,
        class: load.class,
        required_output: load.required_output,
      })),
      blockers: missing.map((item) => `missing required processor class: ${item}`),
      convergence_rule: convergenceRule,
      next_route: "do not pretend swarm execution; run the surviving bounded load and record the missing classes",
    };
  }

  return {
    ok: true,
    action: "dispatch_processor_fabric",
    scene_id: sceneId,
    dispatches: loads.map((load, index) => ({
      processor_id: `${sceneId}:processor:${index + 1}`,
      load_id: load.load_id,
      class: load.class,
      required_output: load.required_output,
    })),
    blockers: [],
    convergence_rule: convergenceRule,
    next_route: "run bounded processors independently, then release only the converged external act or exact blocker",
  };
}

export function runProcessorFabricProof(): void {
  const verdict = compileProcessorFabric({
    scene_id: "loading-20-finalization",
    max_processors: 4,
    convergence_rule: "collapse to one external embodiment or exact blocker",
    loads: [
      { load_id: "reentry", class: "corpus_reentry", source_tier: "direct_archive", required_output: "ledger_delta" },
      { load_id: "truth", class: "source_truth_grading", source_tier: "archive_derived", required_output: "route_attack" },
      { load_id: "novelty", class: "move_class_synthesis", source_tier: "memory", required_output: "candidate_mechanism" },
      { load_id: "act", class: "external_act_forcing", source_tier: "direct_current_instruction", required_output: "proof_pressure" },
    ],
  });

  if (!verdict.ok || verdict.action !== "dispatch_processor_fabric" || verdict.dispatches.length !== 4) {
    throw new Error(`processor fabric proof failed: ${verdict.action} ${verdict.blockers.join("; ")}`);
  }
}

runProcessorFabricProof();

export * from "./processor-load-intake.js";
export * from "./processor-quorum.js";
export * from "./processor-settlement.js";
export * from "./processor-result-receipt.js";
export * from "./processor-source-authority.js";
export * from "./source-authorized-convergence.js";
export * from "./processor-output-integrity.js";
export * from "./processor-continuation-handoff.js";
export * from "./processor-workload-frontier.js";
export * from "./processor-embodiment-boundary.js";
export * from "./live-head-reentry-plan.js";
