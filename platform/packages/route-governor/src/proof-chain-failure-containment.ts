export type ProofChainStatusState = "passing" | "passing_with_warnings" | "pending" | "failing" | "unknown";

export type ProofChainCandidateIntent =
  | "repair_current_failure"
  | "extend_proof_chain"
  | "failure_detail_containment"
  | "external_embodiment"
  | "warning_maintenance";

export type ProofChainContainmentAction =
  | "allow_repair_from_detail"
  | "allow_containment_increment"
  | "allow_proof_chain_extension"
  | "block_stale_status"
  | "block_missing_failure_detail"
  | "block_unrelated_proof_extension"
  | "block_repeated_artifact"
  | "block_incomplete_candidate";

export interface ProofChainContainmentCandidate {
  candidate_id: string;
  intent: ProofChainCandidateIntent;
  artifact_class: string;
  changed_files: string[];
  executable_artifacts: string[];
  routing_artifacts: string[];
  proof_artifacts: string[];
  appends_proof_command: boolean;
  claims_repair: boolean;
}

export interface ProofChainFailureContainmentInput {
  branch: string;
  active_branch: string;
  live_head_sha: string;
  status_head_sha?: string;
  status_state: ProofChainStatusState;
  failing_check_name?: string;
  failing_step?: string;
  actionable_failure_detail?: string;
  spent_artifact_classes: string[];
  candidate?: ProofChainContainmentCandidate;
}

export interface ProofChainFailureContainmentVerdict {
  ok: boolean;
  action: ProofChainContainmentAction;
  branch: string;
  head_sha: string;
  admitted_candidate_id: string | null;
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

function executablePlatformPath(path: string): boolean {
  return (
    path.startsWith("platform/packages/") &&
    (path.endsWith(".ts") || path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".json"))
  );
}

function base(input: ProofChainFailureContainmentInput): Pick<ProofChainFailureContainmentVerdict, "branch" | "head_sha"> {
  return { branch: input.branch, head_sha: input.live_head_sha };
}

function block(
  input: ProofChainFailureContainmentInput,
  action: Exclude<ProofChainContainmentAction, "allow_repair_from_detail" | "allow_containment_increment" | "allow_proof_chain_extension">,
  blockers: string[],
  nextRoute: string,
  decisiveEvidence: string[] = [],
): ProofChainFailureContainmentVerdict {
  return {
    ...base(input),
    ok: false,
    action,
    admitted_candidate_id: null,
    decisive_evidence: decisiveEvidence,
    blockers,
    next_route: nextRoute,
  };
}

function candidateBlockers(input: ProofChainFailureContainmentInput): string[] {
  const candidate = input.candidate;
  if (!candidate) return ["proof-chain containment has no candidate"];

  const blockers: string[] = [];
  if (!candidate.candidate_id.trim()) blockers.push("candidate has no id");
  if (!candidate.artifact_class.trim()) blockers.push("candidate has no artifact class");
  if (input.spent_artifact_classes.includes(candidate.artifact_class)) {
    blockers.push(`candidate repeats spent artifact class: ${candidate.artifact_class}`);
  }
  if (!candidate.changed_files.some(executablePlatformPath)) {
    blockers.push("candidate does not change executable platform files");
  }
  if (candidate.executable_artifacts.length === 0) blockers.push("candidate has no executable artifact evidence");
  if (candidate.routing_artifacts.length === 0) blockers.push("candidate has no future-routing artifact evidence");
  if (candidate.proof_artifacts.length === 0) blockers.push("candidate has no proof artifact evidence");

  return blockers;
}

function candidateEvidence(candidate: ProofChainContainmentCandidate): string[] {
  return [
    candidate.candidate_id,
    candidate.intent,
    candidate.artifact_class,
    ...candidate.changed_files.filter(executablePlatformPath),
    ...candidate.executable_artifacts,
    ...candidate.routing_artifacts,
    ...candidate.proof_artifacts,
  ];
}

function failureSummary(input: ProofChainFailureContainmentInput): string[] {
  return [
    `status ${input.status_state} for ${input.live_head_sha}`,
    input.failing_check_name ? `check=${input.failing_check_name}` : null,
    input.failing_step ? `step=${input.failing_step}` : null,
  ].filter((value): value is string => value !== null);
}

export function containProofChainFailure(
  input: ProofChainFailureContainmentInput,
): ProofChainFailureContainmentVerdict {
  if (input.branch !== input.active_branch) {
    return block(
      input,
      "block_stale_status",
      [`proof-chain containment branch ${input.branch} does not match active branch ${input.active_branch}`],
      "bind proof-chain containment to the active PR branch before release",
    );
  }

  if (input.status_head_sha && input.status_head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_stale_status",
      [`status belongs to ${input.status_head_sha}, not live head ${input.live_head_sha}`],
      "discard stale status before selecting proof-chain continuation work",
      failureSummary(input),
    );
  }

  const blockers = candidateBlockers(input);
  if (blockers.some((candidateBlocker) => candidateBlocker.includes("spent artifact class"))) {
    return block(input, "block_repeated_artifact", blockers, "select an unspent proof-chain containment artifact");
  }

  if (blockers.length > 0) {
    return block(
      input,
      "block_incomplete_candidate",
      blockers,
      "supply executable, routed, and proof-backed containment evidence before release",
    );
  }

  const candidate = input.candidate;
  if (!candidate) {
    return block(
      input,
      "block_incomplete_candidate",
      ["proof-chain containment has no candidate"],
      "supply executable, routed, and proof-backed containment evidence before release",
    );
  }

  const actionableDetail = input.actionable_failure_detail?.trim();
  if (input.status_state === "failing" && actionableDetail) {
    if (candidate.intent !== "repair_current_failure" || !candidate.claims_repair) {
      return block(
        input,
        "block_unrelated_proof_extension",
        ["current-head failure has actionable detail, so the next proof-chain move must be a bounded repair"],
        "repair only the concrete failure detail before extending the proof chain",
        [actionableDetail],
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "allow_repair_from_detail",
      admitted_candidate_id: candidate.candidate_id,
      decisive_evidence: [...failureSummary(input), actionableDetail, ...candidateEvidence(candidate)],
      blockers: [],
      next_route: "commit the bounded repair, then require moved-head status readback",
    };
  }

  if (input.status_state === "failing") {
    if (candidate.intent !== "failure_detail_containment" || candidate.claims_repair || candidate.appends_proof_command) {
      return block(
        input,
        "block_missing_failure_detail",
        ["current-head proof chain is failing without an actionable log line or assertion"],
        "admit only containment work until a concrete failure detail surfaces",
        failureSummary(input),
      );
    }

    return {
      ...base(input),
      ok: true,
      action: "allow_containment_increment",
      admitted_candidate_id: candidate.candidate_id,
      decisive_evidence: [...failureSummary(input), "no repair claim is made", ...candidateEvidence(candidate)],
      blockers: [],
      next_route: "commit containment only, then obtain the actionable proof failure detail before repair",
    };
  }

  if (candidate.intent === "extend_proof_chain" || candidate.intent === "external_embodiment") {
    return {
      ...base(input),
      ok: true,
      action: "allow_proof_chain_extension",
      admitted_candidate_id: candidate.candidate_id,
      decisive_evidence: [...failureSummary(input), ...candidateEvidence(candidate)],
      blockers: [],
      next_route: "commit the proof-chain extension, then bind status readback to the moved head",
    };
  }

  return block(
    input,
    "block_unrelated_proof_extension",
    [`candidate intent ${candidate.intent} is not admitted for status ${input.status_state}`],
    "choose a proof-chain extension, external embodiment, containment increment, or bounded repair according to live status",
    failureSummary(input),
  );
}
