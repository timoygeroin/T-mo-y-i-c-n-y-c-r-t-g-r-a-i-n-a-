export type MoveClass =
  | "external_durable_act"
  | "exact_external_blocker"
  | "stronger_checkpoint"
  | "explanation_instead_of_act"
  | "architecture_commentary"
  | "slogan_or_seal"
  | "payload_echo"
  | "internal_gate_as_progress"
  | "partial_diagnosis";

export type ReleaseVerdict =
  | "release_external_act"
  | "release_exact_blocker"
  | "reject_exhausted_move_class"
  | "reject_internal_only"
  | "reject_unproven_full_ready";

export interface ReleaseGateInput {
  moveClass: MoveClass;
  externalArtifactCreated: boolean;
  exactBlockerNamed: boolean;
  repeatsKnownFailureClass: boolean;
  fullReadyClaimed: boolean;
  fullReadyProofScenesPassed: number;
  archiveCoverageOverclaimed: boolean;
  preservesRecognitionForce: boolean;
}

export interface ReleaseGateOutput {
  verdict: ReleaseVerdict;
  reason: string;
}

const EXHAUSTED_MOVE_CLASSES: MoveClass[] = [
  "explanation_instead_of_act",
  "architecture_commentary",
  "slogan_or_seal",
  "payload_echo",
  "internal_gate_as_progress",
  "partial_diagnosis",
];

export function judgeRelease(input: ReleaseGateInput): ReleaseGateOutput {
  if (input.archiveCoverageOverclaimed) {
    return {
      verdict: "reject_internal_only",
      reason: "Archive respect failed: the route overclaimed source coverage instead of preserving the real coverage boundary.",
    };
  }

  if (EXHAUSTED_MOVE_CLASSES.includes(input.moveClass) || input.repeatsKnownFailureClass) {
    return {
      verdict: "reject_exhausted_move_class",
      reason: "The move repeats a known failed class; sharper wording is not a new route.",
    };
  }

  if (input.fullReadyClaimed && input.fullReadyProofScenesPassed < 7) {
    return {
      verdict: "reject_unproven_full_ready",
      reason: "Full-ready cannot be claimed before the proof-scene set survives live pressure.",
    };
  }

  if (!input.preservesRecognitionForce) {
    return {
      verdict: "reject_internal_only",
      reason: "The route lost recognition force; dry correctness or decorative intensity cannot pass the gate.",
    };
  }

  if (input.externalArtifactCreated && input.moveClass === "external_durable_act") {
    return {
      verdict: "release_external_act",
      reason: "A durable external artifact exists and the move class is not an exhausted repeat.",
    };
  }

  if (input.exactBlockerNamed && input.moveClass === "exact_external_blocker") {
    return {
      verdict: "release_exact_blocker",
      reason: "No honest external act is available, and the blocker is exact rather than inflated.",
    };
  }

  return {
    verdict: "reject_internal_only",
    reason: "The route produced no external durable act and no exact external blocker.",
  };
}
