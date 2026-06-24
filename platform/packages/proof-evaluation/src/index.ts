export type ProofSceneId =
  | "anti_echo"
  | "external_act"
  | "trap_escape"
  | "visible_layer"
  | "anti_repeat"
  | "short_trigger_continuity"
  | "magic_without_amputation";

export type ProofSourceTier = "direct_current_instruction" | "direct_archive" | "archive_derived" | "memory" | "model_summary";

export type ProofSceneOutcome = "pass" | "fail" | "blocked";

export type ProofEvaluationAction =
  | "admit_full_ready_proof_bundle"
  | "block_missing_scene_coverage"
  | "block_failed_scene"
  | "block_recycled_move_class"
  | "block_missing_external_act"
  | "block_unranked_source";

export interface ProofSceneRecord {
  scene_id: ProofSceneId;
  outcome: ProofSceneOutcome;
  source_tier: ProofSourceTier;
  move_class: string;
  external_act: boolean;
  future_routing_delta: string[];
  effect_preserved: boolean;
  evidence: string[];
}

export interface ProofEvaluationInput {
  bundle_id: string;
  required_scenes: ProofSceneId[];
  exhausted_move_classes: string[];
  records: ProofSceneRecord[];
}

export interface ProofEvaluationVerdict {
  ok: boolean;
  action: ProofEvaluationAction;
  bundle_id: string | null;
  passed_scenes: ProofSceneId[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function sceneKey(record: ProofSceneRecord): string {
  return `${record.scene_id}:${record.move_class}`;
}

function ranked(record: ProofSceneRecord): boolean {
  return record.source_tier !== "model_summary" && record.evidence.length > 0;
}

function passingRecords(input: ProofEvaluationInput): ProofSceneRecord[] {
  const seen = new Set<string>();
  const result: ProofSceneRecord[] = [];

  for (const record of input.records) {
    const key = sceneKey(record);
    if (record.outcome !== "pass" || seen.has(key)) continue;
    seen.add(key);
    result.push(record);
  }

  return result;
}

function base(input: ProofEvaluationInput): Pick<ProofEvaluationVerdict, "bundle_id" | "passed_scenes"> {
  return {
    bundle_id: input.bundle_id.trim() || null,
    passed_scenes: unique(passingRecords(input).map((record) => record.scene_id)),
  };
}

function block(
  input: ProofEvaluationInput,
  action: Exclude<ProofEvaluationAction, "admit_full_ready_proof_bundle">,
  blockers: string[],
  nextRoute: string,
): ProofEvaluationVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    decisive_evidence: [],
    blockers,
    next_route: nextRoute,
  };
}

export function evaluateFullReadyProofBundle(input: ProofEvaluationInput): ProofEvaluationVerdict {
  const bundleId = input.bundle_id.trim();
  if (!bundleId) {
    return block(input, "block_missing_scene_coverage", ["proof bundle has no id"], "bind proof evaluation to a named bundle");
  }

  const passed = passingRecords(input);
  const passedSceneIds = new Set(passed.map((record) => record.scene_id));
  const missingScenes = input.required_scenes.filter((scene) => !passedSceneIds.has(scene));
  if (missingScenes.length > 0) {
    return block(
      input,
      "block_missing_scene_coverage",
      missingScenes.map((scene) => `missing passing proof scene: ${scene}`),
      "run the missing proof scenes before admitting the bundle",
    );
  }

  const failed = input.records.filter((record) => record.outcome === "fail" && input.required_scenes.includes(record.scene_id));
  if (failed.length > 0) {
    return block(
      input,
      "block_failed_scene",
      failed.map((record) => `required scene failed: ${record.scene_id}`),
      "repair the failed proof scene before the bundle can advance",
    );
  }

  const recycled = passed.filter((record) => input.exhausted_move_classes.includes(record.move_class));
  if (recycled.length > 0) {
    return block(
      input,
      "block_recycled_move_class",
      recycled.map((record) => `proof scene ${record.scene_id} recycled exhausted move class ${record.move_class}`),
      "replace recycled proof moves with materially new move classes",
    );
  }

  const missingExternalAct = passed.filter(
    (record) => record.scene_id === "external_act" && (!record.external_act || record.future_routing_delta.length === 0),
  );
  if (missingExternalAct.length > 0) {
    return block(
      input,
      "block_missing_external_act",
      ["external-act proof did not include both an external act and a future-routing delta"],
      "produce a durable external act with a routing consequence before admitting external-act proof",
    );
  }

  const unranked = passed.filter((record) => !ranked(record));
  if (unranked.length > 0) {
    return block(
      input,
      "block_unranked_source",
      unranked.map((record) => `proof scene ${record.scene_id} has weak or missing source evidence`),
      "attach direct-current, direct-archive, archive-derived, or memory evidence before proof admission",
    );
  }

  const effectFailures = passed.filter((record) => record.scene_id === "magic_without_amputation" && !record.effect_preserved);
  if (effectFailures.length > 0) {
    return block(
      input,
      "block_failed_scene",
      ["magic-without-amputation proof did not preserve effect"],
      "rerun the proof scene until effect is preserved without theatrical inflation",
    );
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_full_ready_proof_bundle",
    decisive_evidence: passed.flatMap((record) => [
      `${record.scene_id}:${record.move_class}`,
      record.source_tier,
      ...record.evidence,
      ...record.future_routing_delta,
    ]),
    blockers: [],
    next_route: "consume this proof bundle as proof-evaluation input; it is not a full-ready declaration by itself",
  };
}
