export type PostResolutionProofClass =
  | "external_platform_embodiment"
  | "fresh_status_readback"
  | "exact_external_blocker"
  | "metadata_reread"
  | "duplicate_ci_summary"
  | "duplicate_comment"
  | "local_memory_guard"
  | "guessed_future_ci"
  | "reclose_resolved_blocker"
  | "warning_maintenance";

export type PostResolutionProofAuthority =
  | "direct_current_instruction"
  | "live_pr_head"
  | "source_ranked_route"
  | "proof_evaluation_record"
  | "model_summary";

export type PostResolutionExternalProofAction =
  | "admit_post_resolution_external_proof"
  | "admit_exact_external_blocker_proof"
  | "block_repaired_head_reuse"
  | "block_stale_head"
  | "block_recycled_or_non_progress_class"
  | "block_missing_external_act"
  | "block_missing_authority"
  | "block_missing_resolved_boundary";

export interface PostResolutionExternalProofInput {
  proof_id: string;
  branch: string;
  live_head_sha: string;
  repaired_head_sha: string;
  proof_head_sha: string;
  resolved_boundary_ids: string[];
  proof_class: PostResolutionProofClass;
  exhausted_proof_classes: string[];
  source_authority: PostResolutionProofAuthority[];
  external_artifacts: string[];
  future_routing_delta: string[];
  exact_blocker?: string;
}

export interface PostResolutionExternalProofVerdict {
  ok: boolean;
  action: PostResolutionExternalProofAction;
  proof_id: string | null;
  branch: string;
  head_sha: string;
  decisive_evidence: string[];
  blockers: string[];
  quarantined_head_shas: string[];
  next_route: string;
}

const NON_PROGRESS_CLASSES = new Set<PostResolutionProofClass>([
  "fresh_status_readback",
  "metadata_reread",
  "duplicate_ci_summary",
  "duplicate_comment",
  "local_memory_guard",
  "guessed_future_ci",
  "reclose_resolved_blocker",
  "warning_maintenance",
]);

const REQUIRED_AUTHORITIES: PostResolutionProofAuthority[] = [
  "direct_current_instruction",
  "live_pr_head",
  "source_ranked_route",
  "proof_evaluation_record",
];

function clean(value: string): string {
  return value.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function evidence(input: PostResolutionExternalProofInput): string[] {
  return unique([
    `proof ${clean(input.proof_id) || "<missing>"}`,
    `branch ${input.branch}`,
    `head ${input.proof_head_sha}`,
    ...input.resolved_boundary_ids.map((id) => `resolved ${id}`),
    ...input.external_artifacts,
    ...input.future_routing_delta,
  ]);
}

function quarantinedHeads(input: PostResolutionExternalProofInput): string[] {
  return input.repaired_head_sha === input.live_head_sha ? [] : [input.repaired_head_sha];
}

function block(
  input: PostResolutionExternalProofInput,
  action: Exclude<
    PostResolutionExternalProofAction,
    "admit_post_resolution_external_proof" | "admit_exact_external_blocker_proof"
  >,
  blockers: string[],
  nextRoute: string,
): PostResolutionExternalProofVerdict {
  return {
    ok: false,
    action,
    proof_id: clean(input.proof_id) || null,
    branch: input.branch,
    head_sha: input.proof_head_sha,
    decisive_evidence: evidence(input),
    blockers,
    quarantined_head_shas: quarantinedHeads(input),
    next_route: nextRoute,
  };
}

function missingAuthorities(input: PostResolutionExternalProofInput): PostResolutionProofAuthority[] {
  const present = new Set(input.source_authority);
  return REQUIRED_AUTHORITIES.filter((authority) => !present.has(authority));
}

export function evaluatePostResolutionExternalProof(
  input: PostResolutionExternalProofInput,
): PostResolutionExternalProofVerdict {
  const proofId = clean(input.proof_id);
  const routeEvidence = evidence(input);

  if (!proofId) {
    return block(input, "block_missing_authority", ["post-resolution proof has no id"], "bind the proof to a fresh proof id");
  }

  if (input.resolved_boundary_ids.length === 0) {
    return block(
      input,
      "block_missing_resolved_boundary",
      ["post-resolution proof has no resolved boundary id"],
      "attach the resolved repaired-head boundary before evaluating post-resolution proof",
    );
  }

  if (input.proof_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_head",
      [`proof head ${input.proof_head_sha} is not live head ${input.live_head_sha}`],
      "rebuild proof from the live PR head before admission",
    );
  }

  if (input.proof_head_sha === input.repaired_head_sha && input.proof_class !== "exact_external_blocker") {
    return block(
      input,
      "block_repaired_head_reuse",
      [`proof reuses repaired head ${input.repaired_head_sha} as post-resolution progress`],
      "move beyond repaired-head readback before claiming post-resolution external proof",
    );
  }

  if (input.proof_class === "exact_external_blocker") {
    const blocker = clean(input.exact_blocker ?? "");
    if (!blocker) {
      return block(
        input,
        "block_missing_external_act",
        ["exact external blocker proof has no blocker text"],
        "name the exact external blocker or supply an external embodiment proof",
      );
    }

    return {
      ok: true,
      action: "admit_exact_external_blocker_proof",
      proof_id: proofId,
      branch: input.branch,
      head_sha: input.proof_head_sha,
      decisive_evidence: [...routeEvidence, blocker],
      blockers: [blocker],
      quarantined_head_shas: quarantinedHeads(input),
      next_route: "remove the named blocker before admitting another post-resolution proof class",
    };
  }

  if (NON_PROGRESS_CLASSES.has(input.proof_class) || input.exhausted_proof_classes.includes(input.proof_class)) {
    return block(
      input,
      "block_recycled_or_non_progress_class",
      [`${input.proof_class} cannot count as post-resolution external proof`],
      "supply a new external platform embodiment proof or one exact external blocker",
    );
  }

  const missing = missingAuthorities(input);
  if (missing.length > 0 || input.source_authority.includes("model_summary")) {
    return block(
      input,
      "block_missing_authority",
      [
        ...missing.map((authority) => `missing proof authority: ${authority}`),
        ...(input.source_authority.includes("model_summary") ? ["model_summary cannot supply post-resolution proof authority"] : []),
      ],
      "attach direct instruction, live PR head, source-ranked route, and proof-evaluation record authority",
    );
  }

  if (input.external_artifacts.length === 0 || input.future_routing_delta.length === 0) {
    return block(
      input,
      "block_missing_external_act",
      ["post-resolution proof requires both external artifacts and future-routing delta"],
      "produce an executable external embodiment with a routing consequence before proof admission",
    );
  }

  return {
    ok: true,
    action: "admit_post_resolution_external_proof",
    proof_id: proofId,
    branch: input.branch,
    head_sha: input.proof_head_sha,
    decisive_evidence: routeEvidence,
    blockers: [],
    quarantined_head_shas: quarantinedHeads(input),
    next_route: "consume this as post-resolution proof-evaluation evidence, not as a repaired-head status claim",
  };
}
