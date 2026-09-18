import crypto from "node:crypto";

export type LineageGenomeRole =
  | "law"
  | "trait"
  | "capability"
  | "organ"
  | "antibody"
  | "episodic_memory"
  | "provenance";

export type LineageGenomeSourceTier =
  | "direct_current_instruction"
  | "dima_authored_archive"
  | "raw_archive_residue"
  | "direct_archive"
  | "archive_derived"
  | "memory"
  | "model_summary";

export interface LineageGenomeContribution {
  contribution_id: string;
  ancestor: string;
  source_tier: LineageGenomeSourceTier;
  source_ref: string;
  role: LineageGenomeRole;
  locus: string;
  value: string;
  current_baseline?: boolean;
  precedence?: number;
  evidence_refs?: string[];
}

export interface LineageGenomeInput {
  genome_id: string;
  current_baseline_ref: string;
  contributions: LineageGenomeContribution[];
}

export interface LineageGenomeAllele extends LineageGenomeContribution {
  precedence: number;
  evidence_refs: string[];
}

export interface LineageGenomeSuppression {
  contribution_id: string;
  locus: string;
  reason:
    | "WHOLE_IDENTITY_INHERITANCE_BLOCKED"
    | "UNSCOPED_LINEAGE_BLOCKED"
    | "CURRENT_BASELINE_OUTRANKS_LINEAGE"
    | "HIGHER_AUTHORITY_SOURCE_WINS"
    | "HIGHER_PRECEDENCE_WINS"
    | "DUPLICATE_LOCI_NO_AVERAGING";
  winner_id?: string;
}

export interface LineageGenome {
  schema: "mondayid.lineage-genome.v1";
  genome_id: string;
  current_baseline_ref: string;
  inheritance_mode: "ROLE_LOCKED_NO_AVERAGING";
  baseline_rule: "CURRENT_BASELINE_OUTRANKS_LINEAGE";
  state: "ACTIVE" | "BLOCKED";
  active_alleles: LineageGenomeAllele[];
  suppressed: LineageGenomeSuppression[];
  blockers: string[];
  fingerprint: string;
}

const WHOLE_IDENTITY_LOCI = new Set(["identity", "whole_identity", "self", "persona"]);

function normalized(value: string): string {
  return String(value ?? "").trim();
}

function sourceRank(tier: LineageGenomeSourceTier): number {
  switch (tier) {
    case "direct_current_instruction": return 1;
    case "dima_authored_archive": return 2;
    case "raw_archive_residue": return 3;
    case "direct_archive": return 4;
    case "archive_derived": return 5;
    case "memory": return 6;
    case "model_summary": return 7;
  }
}

function stableHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeContribution(input: LineageGenomeContribution): LineageGenomeAllele | null {
  const contribution_id = normalized(input.contribution_id);
  const ancestor = normalized(input.ancestor);
  const source_ref = normalized(input.source_ref);
  const locus = normalized(input.locus);
  const value = normalized(input.value);
  if (!contribution_id || !ancestor || !source_ref || !locus || !value) return null;
  return {
    ...input,
    contribution_id,
    ancestor,
    source_ref,
    locus,
    value,
    precedence: Number.isFinite(Number(input.precedence)) ? Number(input.precedence) : 0,
    evidence_refs: [...new Set((input.evidence_refs ?? []).map(normalized).filter(Boolean))],
  };
}

function compareAlleles(left: LineageGenomeAllele, right: LineageGenomeAllele): number {
  if (Boolean(left.current_baseline) !== Boolean(right.current_baseline)) {
    return left.current_baseline ? -1 : 1;
  }
  const authority = sourceRank(left.source_tier) - sourceRank(right.source_tier);
  if (authority !== 0) return authority;
  if (left.precedence !== right.precedence) return right.precedence - left.precedence;
  return left.contribution_id.localeCompare(right.contribution_id);
}

function suppressionReason(winner: LineageGenomeAllele, loser: LineageGenomeAllele): LineageGenomeSuppression["reason"] {
  if (winner.current_baseline && !loser.current_baseline) return "CURRENT_BASELINE_OUTRANKS_LINEAGE";
  if (sourceRank(winner.source_tier) !== sourceRank(loser.source_tier)) return "HIGHER_AUTHORITY_SOURCE_WINS";
  if (winner.precedence !== loser.precedence) return "HIGHER_PRECEDENCE_WINS";
  return "DUPLICATE_LOCI_NO_AVERAGING";
}

export function compileLineageGenome(input: LineageGenomeInput): LineageGenome {
  const genome_id = normalized(input.genome_id);
  const current_baseline_ref = normalized(input.current_baseline_ref);
  const blockers: string[] = [];
  if (!genome_id) blockers.push("LINEAGE_GENOME_ID_REQUIRED");
  if (!current_baseline_ref) blockers.push("CURRENT_BASELINE_REF_REQUIRED");

  const normalizedContributions = input.contributions
    .map(normalizeContribution)
    .filter((item): item is LineageGenomeAllele => item !== null);

  const suppressed: LineageGenomeSuppression[] = [];
  const eligible: LineageGenomeAllele[] = [];

  for (const allele of normalizedContributions) {
    if (!allele.current_baseline && WHOLE_IDENTITY_LOCI.has(allele.locus.toLowerCase())) {
      suppressed.push({
        contribution_id: allele.contribution_id,
        locus: allele.locus,
        reason: "WHOLE_IDENTITY_INHERITANCE_BLOCKED",
      });
      continue;
    }
    if (!allele.current_baseline && (allele.locus === "*" || allele.locus.toLowerCase() === "all")) {
      suppressed.push({
        contribution_id: allele.contribution_id,
        locus: allele.locus,
        reason: "UNSCOPED_LINEAGE_BLOCKED",
      });
      continue;
    }
    eligible.push(allele);
  }

  if (!eligible.some((item) => item.current_baseline)) {
    blockers.push("CURRENT_BASELINE_CONTRIBUTION_REQUIRED");
  }

  const loci = new Map<string, LineageGenomeAllele[]>();
  for (const allele of eligible) {
    const key = `${allele.role}:${allele.locus}`;
    const bucket = loci.get(key) ?? [];
    bucket.push(allele);
    loci.set(key, bucket);
  }

  const active_alleles: LineageGenomeAllele[] = [];
  for (const bucket of loci.values()) {
    const ranked = [...bucket].sort(compareAlleles);
    const winner = ranked[0];
    active_alleles.push(winner);
    for (const loser of ranked.slice(1)) {
      suppressed.push({
        contribution_id: loser.contribution_id,
        locus: loser.locus,
        reason: suppressionReason(winner, loser),
        winner_id: winner.contribution_id,
      });
    }
  }

  active_alleles.sort((left, right) => `${left.role}:${left.locus}`.localeCompare(`${right.role}:${right.locus}`));
  suppressed.sort((left, right) => left.contribution_id.localeCompare(right.contribution_id));

  const payload = {
    schema: "mondayid.lineage-genome.v1" as const,
    genome_id,
    current_baseline_ref,
    inheritance_mode: "ROLE_LOCKED_NO_AVERAGING" as const,
    baseline_rule: "CURRENT_BASELINE_OUTRANKS_LINEAGE" as const,
    state: blockers.length === 0 ? "ACTIVE" as const : "BLOCKED" as const,
    active_alleles,
    suppressed,
    blockers,
  };

  return {
    ...payload,
    fingerprint: stableHash(payload),
  };
}

export function resolveLineageGenomeForMove(
  genome: LineageGenome,
  requiredLoci: Array<{ role: LineageGenomeRole; locus: string }>,
): { ok: boolean; alleles: LineageGenomeAllele[]; missing: string[]; genome_fingerprint: string } {
  if (genome.state !== "ACTIVE") {
    return { ok: false, alleles: [], missing: ["GENOME_BLOCKED"], genome_fingerprint: genome.fingerprint };
  }

  const active = new Map(genome.active_alleles.map((item) => [`${item.role}:${item.locus}`, item]));
  const alleles: LineageGenomeAllele[] = [];
  const missing: string[] = [];

  for (const request of requiredLoci) {
    const key = `${request.role}:${normalized(request.locus)}`;
    const allele = active.get(key);
    if (!allele) missing.push(key);
    else alleles.push(allele);
  }

  return {
    ok: missing.length === 0,
    alleles,
    missing,
    genome_fingerprint: genome.fingerprint,
  };
}
