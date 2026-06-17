import { attestMoveClassNovelty, type MoveClassNoveltyInput } from "./move-class-novelty-attestation.js";

const input: MoveClassNoveltyInput = {
  active_branch: "monday-platform-genesis-01",
  live_head_sha: "b19537f13ef90d3f06e074fd69fb74ba5c86b40f",
  spent_move_classes: ["metadata_reread", "duplicate_ci_summary", "local_memory_guard"],
  spent_artifact_classes: ["finalization_release_mux", "post_status_embodiment_queue"],
  prior_receipts: [
    {
      receipt_id: "finalization-release-mux",
      head_sha: "a238cc9567cca63ddb22701ffcd3cb3f17732d5b",
      move_class: "external_platform_embodiment",
      artifact_class: "finalization_release_mux",
      novelty_vectors: ["release_geometry"],
      behavior_files: ["platform/packages/route-governor/src/finalization-release-mux.ts"],
      routing_artifacts: ["terminal release mux"],
    },
    {
      receipt_id: "post-status-embodiment-queue",
      head_sha: "15e9293960ed8af0fc9d02bd3a385141af1644c7",
      move_class: "external_platform_embodiment",
      artifact_class: "post_status_embodiment_queue",
      novelty_vectors: ["status_authority", "routing_consequence"],
      behavior_files: ["platform/packages/route-governor/src/post-status-embodiment-queue.ts"],
      routing_artifacts: ["post-status embodiment queue"],
    },
  ],
  candidate: {
    candidate_id: "move-class-novelty-attestation",
    branch: "monday-platform-genesis-01",
    base_head_sha: "b19537f13ef90d3f06e074fd69fb74ba5c86b40f",
    move_class: "external_platform_embodiment",
    artifact_class: "move_class_novelty_attestation",
    changed_files: ["platform/packages/route-governor/src/move-class-novelty-attestation.ts"],
    executable_artifacts: ["attestMoveClassNovelty"],
    routing_artifacts: ["spent move class attestation before terminal release"],
    novelty_vectors: ["behavior_surface", "routing_consequence"],
    novelty_claim: "A continuation must prove a fresh behavior-bearing novelty vector before it can count as non-repeated platform embodiment.",
  },
};

const verdict = attestMoveClassNovelty(input);

if (!verdict.ok) {
  throw new Error(`move class novelty proof failed: ${verdict.blockers.join("; ")}`);
}

console.log(JSON.stringify(verdict, null, 2));
