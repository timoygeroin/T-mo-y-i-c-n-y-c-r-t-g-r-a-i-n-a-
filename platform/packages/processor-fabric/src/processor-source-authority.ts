export type ProcessorSourceAuthorityTier =
  | "direct_current_instruction"
  | "direct_archive"
  | "archive_derived"
  | "memory"
  | "model_summary";

export type ProcessorSourceAuthorityAction =
  | "admit_source_authorized_processor_output"
  | "emit_exact_source_authority_blocker"
  | "block_wrong_branch"
  | "block_wrong_head"
  | "block_missing_output_id"
  | "block_reused_output"
  | "block_missing_source_evidence"
  | "block_weakest_tier_only"
  | "block_missing_behavior_effect";

export interface ProcessorSourceEvidence {
  tier: ProcessorSourceAuthorityTier;
  reference: string;
}

export interface ProcessorSourceAuthorizedOutputCandidate {
  output_id: string;
  branch: string;
  head_sha: string;
  source_evidence: ProcessorSourceEvidence[];
  behavior_effects: string[];
  proof_artifacts: string[];
  exact_blocker?: string;
}

export interface ProcessorSourceAuthorityInput {
  active_branch: string;
  live_head_sha: string;
  candidate: ProcessorSourceAuthorizedOutputCandidate;
  spent_output_ids: string[];
  minimum_authority_tier: Exclude<ProcessorSourceAuthorityTier, "model_summary">;
}

export interface ProcessorSourceAuthorityVerdict {
  ok: boolean;
  action: ProcessorSourceAuthorityAction;
  output_id: string | null;
  branch: string;
  head_sha: string;
  accepted_tiers: ProcessorSourceAuthorityTier[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const TIER_WEIGHT: Record<ProcessorSourceAuthorityTier, number> = {
  direct_current_instruction: 5,
  direct_archive: 4,
  archive_derived: 3,
  memory: 2,
  model_summary: 1,
};

function normalized(value: string): string {
  return value.trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(normalized).filter(Boolean))];
}

function acceptedTiers(evidence: ProcessorSourceEvidence[]): ProcessorSourceAuthorityTier[] {
  return [...new Set(evidence.map((item) => item.tier))];
}

function evidenceReferences(evidence: ProcessorSourceEvidence[]): string[] {
  return unique(evidence.map((item) => `${item.tier}:${item.reference}`));
}

function strongestTier(evidence: ProcessorSourceEvidence[]): ProcessorSourceAuthorityTier | null {
  let selected: ProcessorSourceAuthorityTier | null = null;

  for (const item of evidence) {
    if (!normalized(item.reference)) continue;
    if (!selected || TIER_WEIGHT[item.tier] > TIER_WEIGHT[selected]) selected = item.tier;
  }

  return selected;
}

function block(
  input: ProcessorSourceAuthorityInput,
  action: Exclude<
    ProcessorSourceAuthorityAction,
    "admit_source_authorized_processor_output" | "emit_exact_source_authority_blocker"
  >,
  blockers: string[],
  nextRoute: string,
): ProcessorSourceAuthorityVerdict {
  return {
    ok: false,
    action,
    output_id: normalized(input.candidate.output_id) || null,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    accepted_tiers: acceptedTiers(input.candidate.source_evidence),
    decisive_evidence: evidenceReferences(input.candidate.source_evidence),
    blockers,
    next_route: nextRoute,
  };
}

export function admitProcessorSourceAuthority(
  input: ProcessorSourceAuthorityInput,
): ProcessorSourceAuthorityVerdict {
  const outputId = normalized(input.candidate.output_id);
  const sourceEvidence = input.candidate.source_evidence.filter((item) => normalized(item.reference));
  const tier = strongestTier(sourceEvidence);
  const behaviorEffects = unique(input.candidate.behavior_effects);
  const proofArtifacts = unique(input.candidate.proof_artifacts);
  const exactBlocker = normalized(input.candidate.exact_blocker ?? "");

  if (input.candidate.branch !== input.active_branch) {
    return block(
      input,
      "block_wrong_branch",
      [`processor source output is on ${input.candidate.branch}, not ${input.active_branch}`],
      "rerun processor source authorization against the active PR branch",
    );
  }

  if (input.candidate.head_sha !== input.live_head_sha) {
    return block(
      input,
      "block_wrong_head",
      [`processor source output belongs to ${input.candidate.head_sha}, not live head ${input.live_head_sha}`],
      "discard stale processor source output and rebuild from the live PR head",
    );
  }

  if (!outputId) {
    return block(
      input,
      "block_missing_output_id",
      ["processor source output has no id"],
      "mint a unique source-authorized output id before settlement",
    );
  }

  if (input.spent_output_ids.includes(outputId)) {
    return block(
      input,
      "block_reused_output",
      [`processor source output already spent: ${outputId}`],
      "create a fresh source-authorized output id before another settlement",
    );
  }

  if (!tier || sourceEvidence.length === 0) {
    return block(
      input,
      "block_missing_source_evidence",
      ["processor output has no grounded source evidence"],
      "attach current instruction, direct archive, archive-derived, or memory source evidence before settlement",
    );
  }

  if (TIER_WEIGHT[tier] < TIER_WEIGHT[input.minimum_authority_tier]) {
    return block(
      input,
      "block_weakest_tier_only",
      [`strongest processor source tier ${tier} is weaker than required ${input.minimum_authority_tier}`],
      "raise source authority before the processor output can drive routing",
    );
  }

  if (exactBlocker) {
    return {
      ok: true,
      action: "emit_exact_source_authority_blocker",
      output_id: outputId,
      branch: input.active_branch,
      head_sha: input.live_head_sha,
      accepted_tiers: acceptedTiers(sourceEvidence),
      decisive_evidence: [...evidenceReferences(sourceEvidence), ...proofArtifacts, exactBlocker],
      blockers: [exactBlocker],
      next_route: "settle the exact source-authority blocker before processor-fabric convergence",
    };
  }

  if (behaviorEffects.length === 0) {
    return block(
      input,
      "block_missing_behavior_effect",
      ["processor source output names no behavior effect"],
      "name the future-routing behavior effect before processor output admission",
    );
  }

  if (proofArtifacts.length === 0) {
    return block(
      input,
      "block_missing_source_evidence",
      ["processor source output has no proof artifact"],
      "attach the proof artifact that verifies the source-authorized behavior",
    );
  }

  return {
    ok: true,
    action: "admit_source_authorized_processor_output",
    output_id: outputId,
    branch: input.active_branch,
    head_sha: input.live_head_sha,
    accepted_tiers: acceptedTiers(sourceEvidence),
    decisive_evidence: [...evidenceReferences(sourceEvidence), ...behaviorEffects, ...proofArtifacts],
    blockers: [],
    next_route: "feed only source-authorized processor outputs into convergence or platform embodiment selection",
  };
}
