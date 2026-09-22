import crypto from 'node:crypto';

const stable = value => JSON.stringify(value, Object.keys(value ?? {}).sort());
const digest = value => crypto.createHash('sha256').update(stable(value)).digest('hex').slice(0, 20);

const ALLOWED_KINDS = new Set([
  'origin',
  'constraint',
  'correction',
  'mutation',
  'failure',
  'verification',
  'supersession'
]);

export class CausalLineage {
  constructor(edges = []) {
    this.edges = [];
    this.ids = new Set();
    for (const edge of edges) this.append(edge);
  }

  append({
    id = null,
    kind,
    subject,
    before = null,
    signal = null,
    after = null,
    evidence = [],
    parents = [],
    epistemic = 'observed',
    at = new Date().toISOString()
  } = {}) {
    if (!ALLOWED_KINDS.has(kind)) return { ok:false, code:'INVALID_CAUSAL_KIND' };
    if (!subject) return { ok:false, code:'MISSING_SUBJECT' };
    if (!Array.isArray(evidence)) return { ok:false, code:'INVALID_EVIDENCE' };
    if (!Array.isArray(parents)) return { ok:false, code:'INVALID_PARENTS' };
    for (const parent of parents) {
      if (!this.ids.has(parent)) return { ok:false, code:'UNKNOWN_PARENT', parent };
    }

    const edge = {
      id: id || `cause:${digest({ kind, subject, before, signal, after, evidence, parents, at })}`,
      kind,
      subject,
      before,
      signal,
      after,
      evidence:[...evidence],
      parents:[...parents],
      epistemic,
      at
    };
    if (this.ids.has(edge.id)) return { ok:true, duplicate:true, edge:this.get(edge.id) };

    this.edges.push(edge);
    this.ids.add(edge.id);
    return { ok:true, duplicate:false, edge:structuredClone(edge) };
  }

  get(id) {
    const edge = this.edges.find(item => item.id === id);
    return edge ? structuredClone(edge) : null;
  }

  forSubject(subject) {
    return this.edges.filter(edge => edge.subject === subject).map(structuredClone);
  }

  ancestry(id) {
    const seen = new Set();
    const ordered = [];
    const visit = currentId => {
      if (seen.has(currentId)) return;
      seen.add(currentId);
      const edge = this.edges.find(item => item.id === currentId);
      if (!edge) return;
      for (const parent of edge.parents) visit(parent);
      ordered.push(structuredClone(edge));
    };
    visit(id);
    return ordered;
  }

  corrections(subject) {
    return this.edges
      .filter(edge => edge.subject === subject && edge.kind === 'correction')
      .map(structuredClone);
  }

  snapshot() {
    return this.edges.map(structuredClone);
  }
}

export function evidenceBoundDimaReference(lineage) {
  return async function miniDima({ subject, proposal } = {}) {
    const corrections = lineage?.corrections?.(subject) || [];
    if (corrections.length === 0) {
      return { verdict:'UNKNOWN', evidence:[], reason:'NO_DIRECT_CORRECTION_EVIDENCE' };
    }

    const direct = corrections.filter(edge =>
      edge.epistemic === 'verified' ||
      edge.evidence.some(item => String(item).startsWith('dima:'))
    );
    if (direct.length === 0) {
      return { verdict:'UNKNOWN', evidence:corrections.map(edge => edge.id), reason:'NO_DIRECT_DIMA_EVIDENCE' };
    }

    const contradicts = direct.some(edge => {
      const forbidden = edge.after?.forbid || edge.after?.reject || [];
      const tokens = Array.isArray(forbidden) ? forbidden : [forbidden];
      return tokens.filter(Boolean).some(token =>
        String(proposal?.statement || proposal || '').toLowerCase().includes(String(token).toLowerCase())
      );
    });

    return {
      verdict: contradicts ? 'CONTRADICTED' : 'SUPPORTED',
      evidence: direct.map(edge => edge.id),
      reason: contradicts ? 'DIRECT_CORRECTION_CONTRADICTION' : 'DIRECT_CORRECTION_COMPATIBLE'
    };
  };
}
