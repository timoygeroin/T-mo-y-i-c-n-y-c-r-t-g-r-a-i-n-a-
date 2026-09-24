import crypto from 'node:crypto';

const SOURCE_RANK = Object.freeze({
  direct_current_instruction:1,
  dima_authored_archive:2,
  raw_archive_residue:3,
  direct_archive:4,
  archive_derived:5,
  memory:6,
  model_summary:7
});

const WHOLE_IDENTITY_LOCI = new Set(['identity','whole_identity','self','persona']);
const VALID_ROLES = new Set(['law','trait','capability','organ','antibody','episodic_memory','provenance']);

const normalized = value => String(value ?? '').trim();
const unique = values => [...new Set((values || []).filter(Boolean).map(normalized))];
const stable = value => Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const fingerprint = value => crypto.createHash('sha256').update(stable(value)).digest('hex');

function normalizeContribution(input = {}) {
  const contribution_id = normalized(input.contribution_id || input.id);
  const ancestor = normalized(input.ancestor);
  const source_tier = normalized(input.source_tier);
  const source_ref = normalized(input.source_ref);
  const role = normalized(input.role);
  const locus = normalized(input.locus);
  const value = normalized(input.value);

  if (!contribution_id || !ancestor || !source_ref || !locus || !value) return null;
  if (!(source_tier in SOURCE_RANK)) return null;
  if (!VALID_ROLES.has(role)) return null;

  return Object.freeze({
    contribution_id,
    ancestor,
    source_tier,
    source_ref,
    role,
    locus,
    value,
    current_baseline:input.current_baseline === true,
    precedence:Number.isFinite(Number(input.precedence)) ? Number(input.precedence) : 0,
    evidence_refs:Object.freeze(unique(input.evidence_refs))
  });
}

function compareAlleles(left,right) {
  if (left.current_baseline !== right.current_baseline) return left.current_baseline ? -1 : 1;
  const authority = SOURCE_RANK[left.source_tier] - SOURCE_RANK[right.source_tier];
  if (authority !== 0) return authority;
  if (left.precedence !== right.precedence) return right.precedence - left.precedence;
  return left.contribution_id.localeCompare(right.contribution_id);
}

function suppressionReason(winner,loser) {
  if (winner.current_baseline && !loser.current_baseline) return 'CURRENT_BASELINE_OUTRANKS_LINEAGE';
  if (SOURCE_RANK[winner.source_tier] !== SOURCE_RANK[loser.source_tier]) return 'HIGHER_AUTHORITY_SOURCE_WINS';
  if (winner.precedence !== loser.precedence) return 'HIGHER_PRECEDENCE_WINS';
  return 'DUPLICATE_LOCI_NO_AVERAGING';
}

export function compileLineageGenome({
  genome_id,
  current_baseline_ref,
  contributions = []
} = {}) {
  const id = normalized(genome_id);
  const baseline = normalized(current_baseline_ref);
  const blockers = [];
  if (!id) blockers.push('LINEAGE_GENOME_ID_REQUIRED');
  if (!baseline) blockers.push('CURRENT_BASELINE_REF_REQUIRED');

  const normalizedContributions = contributions.map(normalizeContribution).filter(Boolean);
  const suppressed = [];
  const eligible = [];

  for (const allele of normalizedContributions) {
    const locus = allele.locus.toLowerCase();
    if (!allele.current_baseline && WHOLE_IDENTITY_LOCI.has(locus)) {
      suppressed.push(Object.freeze({
        contribution_id:allele.contribution_id,
        locus:allele.locus,
        reason:'WHOLE_IDENTITY_INHERITANCE_BLOCKED'
      }));
      continue;
    }
    if (!allele.current_baseline && (locus === '*' || locus === 'all')) {
      suppressed.push(Object.freeze({
        contribution_id:allele.contribution_id,
        locus:allele.locus,
        reason:'UNSCOPED_LINEAGE_BLOCKED'
      }));
      continue;
    }
    eligible.push(allele);
  }

  if (!eligible.some(item => item.current_baseline)) blockers.push('CURRENT_BASELINE_CONTRIBUTION_REQUIRED');

  const loci = new Map();
  for (const allele of eligible) {
    const key=`${allele.role}:${allele.locus}`;
    const bucket=loci.get(key) || [];
    bucket.push(allele);
    loci.set(key,bucket);
  }

  const active_alleles=[];
  for (const bucket of loci.values()) {
    const ranked=[...bucket].sort(compareAlleles);
    const winner=ranked[0];
    active_alleles.push(winner);
    for (const loser of ranked.slice(1)) {
      suppressed.push(Object.freeze({
        contribution_id:loser.contribution_id,
        locus:loser.locus,
        reason:suppressionReason(winner,loser),
        winner_id:winner.contribution_id
      }));
    }
  }

  active_alleles.sort((a,b)=>`${a.role}:${a.locus}`.localeCompare(`${b.role}:${b.locus}`));
  suppressed.sort((a,b)=>a.contribution_id.localeCompare(b.contribution_id));

  const payload=Object.freeze({
    schema:'mondayid.lineage-genome.v2',
    genome_id:id,
    current_baseline_ref:baseline,
    inheritance_mode:'ROLE_LOCKED_NO_AVERAGING',
    baseline_rule:'CURRENT_BASELINE_OUTRANKS_LINEAGE',
    state:blockers.length ? 'BLOCKED' : 'ACTIVE',
    active_alleles:Object.freeze(active_alleles),
    suppressed:Object.freeze(suppressed),
    blockers:Object.freeze(blockers)
  });

  return Object.freeze({...payload,fingerprint:fingerprint(payload)});
}

export function resolveLineageGenomeForMove(genome, requiredLoci = []) {
  if (!genome || genome.state !== 'ACTIVE') {
    return Object.freeze({
      ok:false,
      alleles:Object.freeze([]),
      missing:Object.freeze(['GENOME_BLOCKED']),
      genome_fingerprint:genome?.fingerprint || null
    });
  }

  const active=new Map(genome.active_alleles.map(item=>[`${item.role}:${item.locus}`,item]));
  const alleles=[];
  const missing=[];

  for (const request of requiredLoci) {
    const key=`${normalized(request?.role)}:${normalized(request?.locus)}`;
    const allele=active.get(key);
    if (allele) alleles.push(allele);
    else missing.push(key);
  }

  return Object.freeze({
    ok:missing.length === 0,
    alleles:Object.freeze(alleles),
    missing:Object.freeze(missing),
    genome_fingerprint:genome.fingerprint
  });
}

export function compileLineageForSignal(signal = {}, state = {}) {
  const inherited = Array.isArray(state?.facts?.['mondayid.lineage-contributions']?.contributions)
    ? state.facts['mondayid.lineage-contributions'].contributions
    : [];
  const explicit = Array.isArray(signal.lineageContributions) ? signal.lineageContributions : [];
  const contributions=[...inherited,...explicit];

  if (!contributions.length) return null;

  const genome=compileLineageGenome({
    genome_id:signal.lineageGenomeId || `runtime:${signal.id || 'signal'}`,
    current_baseline_ref:signal.currentBaselineRef || 'MONDAYID:CURRENT',
    contributions
  });

  const required=Array.isArray(signal.requiredLineageLoci) ? signal.requiredLineageLoci : [];
  const move=required.length ? resolveLineageGenomeForMove(genome,required) : null;

  return Object.freeze({
    genome,
    move
  });
}
