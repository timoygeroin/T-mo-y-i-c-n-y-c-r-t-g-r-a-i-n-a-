export type ProofArtifactKind =
  | "github_step_summary"
  | "proof_output_log"
  | "actions_annotation"
  | "connector_pr_body"
  | "memory_receipt";

export type ProofArtifactVerdict = "passing" | "passing_with_warnings" | "failing" | "pending" | "unknown";

export type ProofArtifactIntakeAction =
  | "admit_passing_proof_artifact"
  | "route_failure_signature_repair"
  | "block_branch_mismatch"
  | "block_stale_artifact_head"
  | "block_derivative_artifact"
  | "block_missing_failure_signature"
  | "block_pending_or_unknown_artifact"
  | "block_repeated_artifact";

export interface CurrentHeadProofArtifact {
  artifact_id: string;
  kind: ProofArtifactKind;
  branch: string;
  head_sha: string;
  verdict: ProofArtifactVerdict;
  source_url?: string;
  failure_signature?: string;
  decisive_lines: string[];
  non_blocking_warnings: string[];
}

export interface CurrentHeadProofArtifactIntakeInput {
  active_branch: string;
  live_head_sha: string;
  artifact: CurrentHeadProofArtifact;
  spent_artifact_ids: string[];
  derivative_surface_ids: string[];
}

export interface CurrentHeadProofArtifactIntakeVerdict {
  ok: boolean;
  action: ProofArtifactIntakeAction;
  branch: string;
  head_sha: string;
  accepted_artifact_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  warnings: string[];
  next_route: string;
}

const DERIVATIVE_KINDS = new Set<ProofArtifactKind>(["connector_pr_body", "memory_receipt"]);

function base(input: CurrentHeadProofArtifactIntakeInput): Pick<
  CurrentHeadProofArtifactIntakeVerdict,
  "branch" | "head_sha" | "warnings"
> {
  return {
    branch: input.artifact.branch,
    head_sha: input.live_head_sha,
    warnings: input.artifact.non_blocking_warnings,
  };
}

function artifactEvidence(artifact: CurrentHeadProofArtifact): string[] {
  return [
    artifact.artifact_id,
    artifact.kind,
    ...(artifact.source_url ? [artifact.source_url] : []),
    ...artifact.decisive_lines,
  ];
}

function block(
  input: CurrentHeadProofArtifactIntakeInput,
  action: Exclude<
    ProofArtifactIntakeAction,
    "admit_passing_proof_artifact" | "route_failure_signature_repair"
  >,
  blockers: string[],
  nextRoute: string,
  decisiveEvidence: string[] = [],
): CurrentHeadProofArtifactIntakeVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    accepted_artifact_id: null,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

export function intakeCurrentHeadProofArtifact(
  input: CurrentHeadProofArtifactIntakeInput,
): CurrentHeadProofArtifactIntakeVerdict {
  const artifact = input.artifact;

  if (artifact.branch !== input.active_branch) {
    return block(
      input,
      "block_branch_mismatch",
      [`artifact branch ${artifact.branch} does not match active branch ${input.active_branch}`],
      "bind proof artifacts to the active PR branch before using them for finalization routing",
    );
  }

  if (artifact.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_artifact_head",
      [`artifact ${artifact.artifact_id} belongs to ${artifact.head_sha}, not live head ${input.live_head_sha}`],
      "discard stale proof artifacts and obtain proof output for the live PR head",
      artifactEvidence(artifact),
    );
  }

  if (input.spent_artifact_ids.includes(artifact.artifact_id)) {
    return block(
      input,
      "block_repeated_artifact",
      [`proof artifact already spent: ${artifact.artifact_id}`],
      "obtain a new live-head proof artifact or choose a non-repeated embodiment increment",
      artifactEvidence(artifact),
    );
  }

  if (DERIVATIVE_KINDS.has(artifact.kind) || input.derivative_surface_ids.includes(artifact.artifact_id)) {
    return block(
      input,
      "block_derivative_artifact",
      [`artifact ${artifact.artifact_id} is derivative surface ${artifact.kind}, not direct proof output`],
      "use GitHub step summary, proof output log, or Actions annotation before repairing or requesting terminal review",
      artifactEvidence(artifact),
    );
  }

  if (artifact.verdict === "pending" || artifact.verdict === "unknown") {
    return block(
      input,
      "block_pending_or_unknown_artifact",
      [`artifact ${artifact.artifact_id} verdict is ${artifact.verdict}`],
      "wait for completed proof output or select a non-repeated executable embodiment",
      artifactEvidence(artifact),
    );
  }

  if (artifact.verdict === "failing") {
    const failureSignature = artifact.failure_signature?.trim();
    if (!failureSignature) {
      return block(
        input,
        "block_missing_failure_signature",
        [`failing artifact ${artifact.artifact_id} has no concrete failure signature`],
        "extract the failing assertion, command, or log line before attempting repair",
        artifactEvidence(artifact),
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "route_failure_signature_repair",
      accepted_artifact_id: artifact.artifact_id,
      decisive_evidence: [failureSignature, ...artifactEvidence(artifact)],
      blockers: [failureSignature],
      next_route: "repair only the live-head failure signature proven by this proof artifact",
    };
  }

  return {
    ...base(input),
    ok: true,
    action: "admit_passing_proof_artifact",
    accepted_artifact_id: artifact.artifact_id,
    decisive_evidence: artifactEvidence(artifact),
    blockers: [],
    next_route:
      "use this live-head proof artifact as direct proof-output evidence before requesting review or choosing the next embodiment",
  };
}
