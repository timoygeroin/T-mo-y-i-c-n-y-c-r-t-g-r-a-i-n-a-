import crypto from 'node:crypto';
import { RootContinuityContract } from './root-continuity.mjs';

const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value);

const digest = value => crypto.createHash('sha256').update(stable(value)).digest('hex').slice(0, 20);
const clone = value => value == null ? value : structuredClone(value);

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
  constructor(edgesOrOptions = [], options = {}) {
    const config = Array.isArray(edgesOrOptions)
      ? { ...options, edges:edgesOrOptions }
      : (edgesOrOptions || {});

    this.edges = [];
    this.ids = new Set();
    this.rootContract = config.rootContract || new RootContinuityContract(config.root || {});
    for (const edge of config.edges || []) this.append(edge);
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
    at = new Date().toISOString(),
    scope = 'organism',
    verification = null,
    provenance = [],
    readSet = [],
    writeSet = [],
    authority = null,
    status = null
  } = {}) {
    if (!ALLOWED_KINDS.has(kind)) return { ok:false, code:'INVALID_CAUSAL_KIND' };
    if (!subject) return { ok:false, code:'MISSING_SUBJECT' };
    if (!Array.isArray(evidence)) return { ok:false, code:'INVALID_EVIDENCE' };
    if (!Array.isArray(parents)) return { ok:false, code:'INVALID_PARENTS' };
    if (!Array.isArray(provenance)) return { ok:false, code:'INVALID_PROVENANCE' };
    if (!Array.isArray(readSet) || !Array.isArray(writeSet)) return { ok:false, code:'INVALID_ACCESS_SET' };
    for (const parent of parents) {
      if (!this.ids.has(parent)) return { ok:false, code:'UNKNOWN_PARENT', parent };
    }

    const mutationId = id || `cause:${digest({ kind, subject, before, signal, after, evidence, parents, scope, at })}`;
    let continuity = null;
    if (kind === 'mutation' && scope === 'architecture') {
      continuity = this.rootContract.validateMutation({
        mutation:{
          id:mutationId,
          kind:'kernel',
          scope,
          statement:after?.statement ?? after,
          rootId:after?.rootId ?? null,
          removesInvariants:after?.removesInvariants ?? [],
          amendsRoot:after?.amendsRoot === true
        },
        evidence,
        verification,
        parentState:before,
        nextState:after
      });
      if (!continuity.ok) {
        return {
          ok:false,
          state:'CANDIDATE',
          code:continuity.code,
          continuity
        };
      }
    }

    const edge = {
      id:mutationId,
      kind,
      subject,
      before:clone(before),
      signal:clone(signal),
      after:clone(after),
      evidence:[...evidence],
      parents:[...parents],
      epistemic,
      at,
      scope,
      verification:clone(verification),
      provenance:clone(provenance),
      readSet:[...new Set(readSet.map(String))],
      writeSet:[...new Set(writeSet.map(String))],
      authority:clone(authority),
      status:status || (
        epistemic === 'verified' || epistemic === 'historical'
          ? 'ACCEPTED'
          : 'PROPOSED'
      ),
      continuityProof:continuity?.proof || null
    };

    if (this.ids.has(edge.id)) {
      return { ok:true, duplicate:true, edge:this.get(edge.id) };
    }

    this.edges.push(edge);
    this.ids.add(edge.id);
    return {
      ok:true,
      duplicate:false,
      edge:clone(edge),
      continuity:continuity || {
        ok:true,
        code:'ROOT_REVIEW_NOT_REQUIRED',
        rootId:this.rootContract.rootId,
        contractVersion:this.rootContract.version
      }
    };
  }

  get(id) {
    const edge = this.edges.find(item => item.id === id);
    return edge ? clone(edge) : null;
  }

  forSubject(subject) {
    return this.edges.filter(edge => edge.subject === subject).map(clone);
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
      ordered.push(clone(edge));
    };
    visit(id);
    return ordered;
  }

  heads({ acceptedOnly = false } = {}) {
    const candidates = acceptedOnly
      ? this.edges.filter(edge => edge.status === 'ACCEPTED')
      : this.edges;
    const ids = new Set(candidates.map(edge => edge.id));
    const parentIds = new Set(candidates.flatMap(edge => edge.parents).filter(id => ids.has(id)));
    return [...ids].filter(id => !parentIds.has(id)).sort();
  }

  corrections(subject) {
    return this.edges
      .filter(edge => edge.subject === subject && edge.kind === 'correction')
      .map(clone);
  }

  acceptedClosure() {
    return this.edges
      .filter(edge => edge.status === 'ACCEPTED')
      .map(clone);
  }

  identity() {
    return {
      root:this.rootContract.snapshot(),
      acceptedHeads:this.heads({ acceptedOnly:true }),
      acceptedEventIds:this.acceptedClosure().map(edge => edge.id)
    };
  }

  snapshot() {
    return this.edges.map(clone);
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
      verdict:contradicts ? 'CONTRADICTED' : 'SUPPORTED',
      evidence:direct.map(edge => edge.id),
      reason:contradicts ? 'DIRECT_CORRECTION_CONTRADICTION' : 'DIRECT_CORRECTION_COMPATIBLE'
    };
  };
}
