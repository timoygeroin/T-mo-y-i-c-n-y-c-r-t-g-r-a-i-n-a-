import {
  admitPostReviewEmbodimentCandidate,
  type PostReviewEmbodimentCandidateInput,
} from "./post-review-embodiment-candidate.js";

const branch = "monday-platform-genesis-01";
const head = "1829aa8a3ed5dcebf3a7beeae706c450d2c9000e";
const targetFile = "platform/packages/route-governor/src/review-feedback-delta-router.ts";
const signature = "review-delta-1:review-feedback-delta-router:behavior-proof";

function input(overrides: Partial<PostReviewEmbodimentCandidateInput> = {}): PostReviewEmbodimentCandidateInput {
  return {
    active_branch: branch,
    live_head_sha: head,
    route_id: "post-review-embodiment-candidate-proof",
    spent_route_ids: [],
    spent_candidate_signatures: [],
    requested_next_action: "external_platform_embodiment",
    review_delta: {
      delta_id: "review-delta-1",
      branch,
      head_sha: head,
      kind: "changes_requested",
      file_paths: [targetFile],
      evidence: ["file-bound review delta"],
    },
    candidate: {
      candidate_id: "review-bound-repair",
      branch,
      base_head_sha: head,
      candidate_signature: signature,
      changed_files: [targetFile, "platform/packages/route-governor/src/post-review-embodiment-candidate.ts"],
      behavior_exports: ["admitPostReviewEmbodimentCandidate"],
      routing_artifacts: ["post-review candidates must cover every file-bound review target"],
      proof_artifacts: ["post-review-embodiment-candidate-proof.ts"],
    },
    ...overrides,
  };
}

function expectAction(name: string, action: string, expected: string): void {
  if (action !== expected) throw new Error(`${name} used ${action}, expected ${expected}`);
}

export function runPostReviewEmbodimentCandidateProof(): void {
  const admitted = admitPostReviewEmbodimentCandidate(input());
  if (!admitted.ok) throw new Error(`review-bound candidate should pass: ${admitted.blockers.join("; ")}`);
  expectAction("review-bound candidate", admitted.action, "admit_post_review_embodiment");
  if (!admitted.decisive_evidence.includes(`covers review target ${targetFile}`)) {
    throw new Error("admitted candidate did not bind to the review target file");
  }

  const unboundCandidate = admitPostReviewEmbodimentCandidate(
    input({
      candidate: {
        candidate_id: "unbound-review-repair",
        branch,
        base_head_sha: head,
        candidate_signature: "unbound-review-repair",
        changed_files: ["platform/packages/route-governor/src/post-review-embodiment-candidate.ts"],
        behavior_exports: ["admitPostReviewEmbodimentCandidate"],
        routing_artifacts: ["does not cover review target"],
        proof_artifacts: ["post-review-embodiment-candidate-proof.ts"],
      },
    }),
  );
  if (unboundCandidate.ok) throw new Error("candidate without review target coverage should block");
  expectAction("unbound candidate", unboundCandidate.action, "block_unbound_candidate_files");

  const repeatedSignature = admitPostReviewEmbodimentCandidate(
    input({ spent_candidate_signatures: [signature] }),
  );
  if (repeatedSignature.ok) throw new Error("spent review candidate signature should block");
  expectAction("spent signature", repeatedSignature.action, "block_spent_candidate_signature");

  const metadataReplay = admitPostReviewEmbodimentCandidate(input({ requested_next_action: "metadata_reread" }));
  if (metadataReplay.ok) throw new Error("metadata reread should not consume review feedback");
  expectAction("metadata replay", metadataReplay.action, "block_non_progress_action");
}

runPostReviewEmbodimentCandidateProof();
