import {
  admitHeadBoundCandidateNovelty,
  type HeadBoundCandidateNoveltyInput,
} from "./head-bound-candidate-novelty.js";

const liveHead = "97740cccb339f94b5549922768cf92e2a72323c7";
const signature = "review-ready-embodiment-handoff:live-head:behavior-routing-proof";

function input(overrides: Partial<HeadBoundCandidateNoveltyInput> = {}): HeadBoundCandidateNoveltyInput {
  return {
    active_branch: "monday-platform-genesis-01",
    live_head_sha: liveHead,
    candidate_id: "head-bound-candidate-novelty-proof",
    candidate_branch: "monday-platform-genesis-01",
    candidate_head_sha: liveHead,
    artifact_class: "semantic-candidate-novelty-gate",
    move_class: "external_platform_embodiment",
    candidate_signature: signature,
    spent_candidate_signatures: [],
    spent_artifact_classes: [],
    spent_move_classes: [],
    changed_files: ["platform/packages/route-governor/src/head-bound-candidate-novelty.ts"],
    executable_behavior_exports: ["admitHeadBoundCandidateNovelty"],
    future_routing_effects: ["blocks relabeled candidates whose semantic signature was already spent"],
    ...overrides,
  };
}

function expectAction(name: string, action: string, expected: string): void {
  if (action !== expected) throw new Error(`${name} used ${action}, expected ${expected}`);
}

export function runHeadBoundCandidateNoveltyProof(): void {
  const admitted = admitHeadBoundCandidateNovelty(input());
  if (!admitted.ok) throw new Error(`unique candidate should pass: ${admitted.blockers.join("; ")}`);
  expectAction("unique semantic candidate", admitted.action, "admit_head_bound_candidate");
  if (admitted.admitted_candidate_signature !== signature) {
    throw new Error("admitted candidate did not preserve its semantic novelty signature");
  }

  const relabeledRepeat = admitHeadBoundCandidateNovelty(
    input({
      candidate_id: "relabeled-repeat",
      artifact_class: "apparently-new-wrapper",
      spent_candidate_signatures: [signature],
    }),
  );
  if (relabeledRepeat.ok) throw new Error("relabeled repeat should block");
  expectAction("relabeled semantic repeat", relabeledRepeat.action, "block_spent_candidate_signature");

  const spentArtifact = admitHeadBoundCandidateNovelty(
    input({ spent_artifact_classes: ["semantic-candidate-novelty-gate"] }),
  );
  if (spentArtifact.ok) throw new Error("spent artifact class should block");
  expectAction("spent artifact class", spentArtifact.action, "block_spent_artifact_class");

  const oldBlockerReplay = admitHeadBoundCandidateNovelty(input({ move_class: "old_repaired_head_blocker" }));
  if (oldBlockerReplay.ok) throw new Error("old repaired-head blocker replay should block");
  expectAction("old blocker replay", oldBlockerReplay.action, "block_spent_move_class");
}

runHeadBoundCandidateNoveltyProof();
