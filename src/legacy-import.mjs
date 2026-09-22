import { CausalLineage } from './causal-lineage.mjs';

// One-way compatibility membrane. New runtime never imports legacy modules.
export function legacyEvidenceToEvents(records = []) {
  return records.map((r, i) => ({
    id: r.id || `legacy:${i}`,
    kind: r.kind === 'failure' ? 'failure' : 'fact',
    subject: r.subject || `legacy:${i}`,
    payload: { imported: true, legacy: r.payload ?? r },
    evidence: r.evidence || null,
    epistemic: r.verified ? 'verified' : 'historical'
  }));
}

const CAUSAL_KINDS = new Set([
  'origin',
  'constraint',
  'correction',
  'mutation',
  'failure',
  'verification',
  'supersession'
]);

export function normalizeLegacyCausalRecord(record = {}, index = 0) {
  const kind = CAUSAL_KINDS.has(record.kind) ? record.kind : null;
  if (!kind) return { ok:false, code:'NON_CAUSAL_RECORD', record };

  const edge = {
    id: record.id || `legacy-cause:${index}`,
    kind,
    subject: record.subject || `legacy:${index}`,
    before: record.before ?? null,
    signal: record.signal ?? record.correction ?? null,
    after: record.after ?? record.payload ?? null,
    evidence: Array.isArray(record.evidence)
      ? record.evidence
      : record.evidence
        ? [record.evidence]
        : [],
    parents: Array.isArray(record.parents) ? record.parents : [],
    epistemic: record.epistemic || (record.verified ? 'verified' : 'historical'),
    at: record.at || record.timestamp || new Date(0).toISOString()
  };

  return { ok:true, edge };
}

export function importLegacyCausalLineage(records = [], lineage = new CausalLineage()) {
  const normalized = records
    .map(normalizeLegacyCausalRecord)
    .filter(item => item.ok)
    .map(item => item.edge);

  const pending = new Map(normalized.map(edge => [edge.id, edge]));
  const imported = [];
  let progressed = true;

  while (pending.size > 0 && progressed) {
    progressed = false;
    for (const [id, edge] of [...pending.entries()]) {
      const parentsReady = edge.parents.every(parent => Boolean(lineage.get(parent)));
      if (!parentsReady) continue;

      const out = lineage.append(edge);
      if (!out.ok) {
        pending.delete(id);
        imported.push({ id, ok:false, code:out.code });
        progressed = true;
        continue;
      }

      pending.delete(id);
      imported.push({ id, ok:true, duplicate:Boolean(out.duplicate) });
      progressed = true;
    }
  }

  const unresolved = [...pending.values()].map(edge => ({
    id:edge.id,
    subject:edge.subject,
    missingParents:edge.parents.filter(parent => !lineage.get(parent))
  }));

  return {
    ok: unresolved.length === 0,
    code: unresolved.length === 0 ? null : 'UNRESOLVED_CAUSAL_PARENTS',
    imported,
    unresolved,
    lineage
  };
}
