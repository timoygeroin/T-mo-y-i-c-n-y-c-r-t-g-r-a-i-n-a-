import type { CorpusMemoryIngressVerdict, CorpusMemoryLedgerEntry, CorpusMemorySourceTier } from "./index.js";

export type SourceProofAuthority =
  | "direct_current_instruction"
  | "live_pr_head"
  | "source_ranked_route"
  | "proof_evaluation_record";

export type SourceProofAuthorityBridgeAction =
  | "compile_source_ranked_proof_authority"
  | "block_unadmitted_source_ledger"
  | "block_missing_proof_bundle"
  | "block_missing_direct_authority"
  | "block_missing_external_surface";

export interface SourceProofAuthorityBridgeInput {
  proof_bundle_id: string;
  branch: string;
  live_head_sha: string;
  external_artifacts: string[];
  ledger: CorpusMemoryIngressVerdict;
  required_authorities: SourceProofAuthority[];
}

export interface SourceProofAuthorityBridgeVerdict {
  ok: boolean;
  action: SourceProofAuthorityBridgeAction;
  proof_bundle_id: string | null;
  branch: string;
  head_sha: string;
  source_authority: SourceProofAuthority[];
  source_entries: CorpusMemoryLedgerEntry[];
  decisive_evidence: string[];
  blockers: string[];
  next_route: string;
}

const DIRECT_TIERS = new Set<CorpusMemorySourceTier>([
  "direct_current_instruction",
  "dima_authored_archive",
  "raw_archive_residue",
  "direct_archive",
]);

function clean(value: string): string {
  return value.trim();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function entryEvidence(entries: CorpusMemoryLedgerEntry[]): string[] {
  return entries.map((entry) => `${entry.tier}:${entry.reference}:${entry.claim}`);
}

function inferredAuthorities(input: SourceProofAuthorityBridgeInput): SourceProofAuthority[] {
  const authorities: SourceProofAuthority[] = [];
  if (input.ledger.admitted_entries.some((entry) => DIRECT_TIERS.has(entry.tier))) {
    authorities.push("direct_current_instruction");
  }
  if (clean(input.live_head_sha) && clean(input.branch)) authorities.push("live_pr_head");
  if (input.ledger.ok && input.ledger.admitted_entries.length > 0) authorities.push("source_ranked_route");
  if (clean(input.proof_bundle_id)) authorities.push("proof_evaluation_record");
  return unique(authorities);
}

function block(
  input: SourceProofAuthorityBridgeInput,
  action: Exclude<SourceProofAuthorityBridgeAction, "compile_source_ranked_proof_authority">,
  blockers: string[],
  nextRoute: string,
): SourceProofAuthorityBridgeVerdict {
  return {
    ok: false,
    action,
    proof_bundle_id: clean(input.proof_bundle_id) || null,
    branch: input.branch,
    head_sha: input.live_head_sha,
    source_authority: inferredAuthorities(input),
    source_entries: input.ledger.admitted_entries,
    decisive_evidence: [...entryEvidence(input.ledger.admitted_entries), ...input.external_artifacts],
    blockers,
    next_route: nextRoute,
  };
}

export function compileSourceProofAuthorityBridge(
  input: SourceProofAuthorityBridgeInput,
): SourceProofAuthorityBridgeVerdict {
  const proofBundleId = clean(input.proof_bundle_id);
  const authorities = inferredAuthorities(input);
  const missing = input.required_authorities.filter((authority) => !authorities.includes(authority));

  if (!proofBundleId) {
    return block(input, "block_missing_proof_bundle", ["source proof authority bridge has no proof bundle id"], "bind source authority to a named proof bundle before proof-evaluation admission");
  }

  if (!input.ledger.ok) {
    return block(input, "block_unadmitted_source_ledger", input.ledger.blockers, "repair or narrow the corpus-memory ledger before proof authority handoff");
  }

  if (!input.ledger.admitted_entries.some((entry) => DIRECT_TIERS.has(entry.tier))) {
    return block(input, "block_missing_direct_authority", ["source bridge has no direct-current, Dima-authored, raw-residue, or direct-archive authority"], "attach stronger Dima/direct archive authority before proof authority handoff");
  }

  if (!clean(input.branch) || !clean(input.live_head_sha) || input.external_artifacts.length === 0) {
    return block(input, "block_missing_external_surface", ["source bridge lacks branch, live head, or external artifact evidence"], "attach live PR head and externally retrievable artifacts before proof authority handoff");
  }

  if (missing.length > 0) {
    return block(
      input,
      "block_missing_direct_authority",
      missing.map((authority) => `missing source proof authority: ${authority}`),
      "complete required proof authorities before handing source ledger to proof evaluation",
    );
  }

  return {
    ok: true,
    action: "compile_source_ranked_proof_authority",
    proof_bundle_id: proofBundleId,
    branch: input.branch,
    head_sha: input.live_head_sha,
    source_authority: authorities,
    source_entries: input.ledger.admitted_entries,
    decisive_evidence: [...entryEvidence(input.ledger.admitted_entries), ...input.external_artifacts],
    blockers: [],
    next_route: "use this authority bridge as proof-evaluation input; do not replace it with model-summary authority",
  };
}
