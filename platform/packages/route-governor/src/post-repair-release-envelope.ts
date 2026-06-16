import type { PostRepairAdmissionVerdict } from "./post-repair-embodiment-admission.js";

export type PostRepairReleaseEnvelopeAction =
  | "compile_post_repair_release_envelope"
  | "block_unadmitted_post_repair_embodiment"
  | "block_branch_mismatch"
  | "block_stale_live_head"
  | "block_missing_envelope_id"
  | "block_replayed_envelope"
  | "block_missing_release_evidence";

export interface PostRepairReleaseEnvelopeInput {
  admission: PostRepairAdmissionVerdict;
  active_branch: string;
  live_head_sha: string;
  envelope_id: string;
  spent_envelope_ids: string[];
  required_evidence: string[];
}

export interface PostRepairReleaseEnvelope {
  envelope_id: string;
  release_class: "post_repair_external_embodiment";
  branch: string;
  head_sha: string;
  guard: {
    require_admission_action: "admit_post_repair_embodiment";
    require_live_head_sha: string;
    require_next_status_head: "moved_head_only";
    forbidden_progress_claims: string[];
  };
  decisive_evidence: string[];
  next_route: string;
}

export interface PostRepairReleaseEnvelopeVerdict {
  ok: boolean;
  action: PostRepairReleaseEnvelopeAction;
  envelope: PostRepairReleaseEnvelope | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function block(
  action: Exclude<PostRepairReleaseEnvelopeAction, "compile_post_repair_release_envelope">,
  decisiveEvidence: string[],
  blockers: string[],
  nextRoute: string,
): PostRepairReleaseEnvelopeVerdict {
  return {
    ok: false,
    action,
    envelope: null,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

function missingRequiredEvidence(admission: PostRepairAdmissionVerdict, requiredEvidence: string[]): string[] {
  return requiredEvidence
    .map((evidence) => evidence.trim())
    .filter(Boolean)
    .filter((evidence) => !admission.decisive_evidence.includes(evidence));
}

export function compilePostRepairReleaseEnvelope(
  input: PostRepairReleaseEnvelopeInput,
): PostRepairReleaseEnvelopeVerdict {
  const evidence = [
    `admission action ${input.admission.action}`,
    `admission branch ${input.admission.branch}`,
    `admission head ${input.admission.head_sha}`,
    `live head ${input.live_head_sha}`,
  ];

  if (!input.admission.ok || input.admission.action !== "admit_post_repair_embodiment") {
    return block(
      "block_unadmitted_post_repair_embodiment",
      evidence,
      [...input.admission.blockers, `post-repair admission action is ${input.admission.action}`],
      "compile a release envelope only after a behavior-bearing post-repair embodiment is admitted",
    );
  }

  if (input.admission.branch !== input.active_branch) {
    return block(
      "block_branch_mismatch",
      evidence,
      [`post-repair admission branch ${input.admission.branch} is not active branch ${input.active_branch}`],
      "re-enter the active PR branch before compiling the release envelope",
    );
  }

  if (input.admission.head_sha !== input.live_head_sha) {
    return block(
      "block_stale_live_head",
      evidence,
      [`post-repair admission head ${input.admission.head_sha} is not live head ${input.live_head_sha}`],
      "refresh post-repair admission against the live head before release",
    );
  }

  const envelopeId = input.envelope_id.trim();
  if (!envelopeId) {
    return block(
      "block_missing_envelope_id",
      evidence,
      ["post-repair release envelope has no envelope id"],
      "compile release envelopes with a durable id before handoff",
    );
  }

  if (input.spent_envelope_ids.includes(envelopeId)) {
    return block(
      "block_replayed_envelope",
      evidence,
      [`post-repair release envelope already spent: ${envelopeId}`],
      "do not replay a spent release envelope for the same post-repair route",
    );
  }

  const missing = missingRequiredEvidence(input.admission, input.required_evidence);
  if (missing.length > 0) {
    return block(
      "block_missing_release_evidence",
      evidence,
      missing.map((item) => `post-repair release envelope missing evidence: ${item}`),
      "carry behavior, routing, and proof evidence from admission into the release envelope",
    );
  }

  const decisiveEvidence = [...evidence, envelopeId, ...input.admission.decisive_evidence];
  const envelope: PostRepairReleaseEnvelope = {
    envelope_id: envelopeId,
    release_class: "post_repair_external_embodiment",
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    guard: {
      require_admission_action: "admit_post_repair_embodiment",
      require_live_head_sha: input.live_head_sha,
      require_next_status_head: "moved_head_only",
      forbidden_progress_claims: [
        "duplicate_repaired_head_readback",
        "duplicate_ci_summary",
        "metadata_reread",
        "reclose_resolved_blocker",
        "warning_maintenance_as_release",
        "review_or_merge_without_moved_head_status",
      ],
    },
    decisive_evidence: decisiveEvidence,
    next_route: "move the branch with this embodiment, then require status readback only for the new moved head",
  };

  return {
    ok: true,
    action: "compile_post_repair_release_envelope",
    envelope,
    decisive_evidence: decisiveEvidence,
    blockers: [],
    next_route: envelope.next_route,
  };
}
