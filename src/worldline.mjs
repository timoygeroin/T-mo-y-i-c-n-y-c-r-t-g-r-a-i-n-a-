import crypto from 'node:crypto';

const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value);

export const hash = (value) => crypto.createHash('sha256').update(stable(value)).digest('hex');

const clone = value => value == null ? value : structuredClone(value);
const list = value => Array.isArray(value) ? [...new Set(value.filter(Boolean).map(String))] : [];
const intersects = (a, b) => {
  const right = new Set(b);
  return a.some(item => right.has(item));
};

export class Worldline {
  #events = [];
  #ids = new Set();
  #revision = 'root';
  #revisions = new Map([['root',{ revision:'root', eventId:null, parents:[] }]]);
  #eventRevision = new Map();
  #heads = new Set(['root']);
  #cellHeads = new Map();

  revision() { return this.#revision; }

  heads() {
    return [...this.#heads].sort();
  }

  cellHead(cellId) {
    return this.#cellHeads.get(cellId) || this.#revision;
  }

  fork(cellId, baseRevision = this.#revision) {
    if (!cellId) return { ok:false, code:'CELL_ID_REQUIRED' };
    if (!this.#revisions.has(baseRevision)) {
      return { ok:false, code:'UNKNOWN_BASE_REVISION', baseRevision };
    }
    this.#cellHeads.set(cellId, baseRevision);
    return { ok:true, cellId, revision:baseRevision };
  }

  events(head = null) {
    if (!head) return clone(this.#events);
    const revisions = this.#ancestryRevisions(head);
    return revisions
      .map(revision => this.#revisions.get(revision)?.event)
      .filter(Boolean)
      .map(clone);
  }

  revisionRecord(revision) {
    const record = this.#revisions.get(revision);
    return record ? clone(record) : null;
  }

  #normalize(event = {}, {
    parents = [],
    baseRevision = null,
    readSet = null,
    writeSet = null,
    scope = null,
    reconciliation = 'DIRECT'
  } = {}) {
    const kind = event.kind || 'observation';
    const subject = event.subject || 'system';
    const normalizedWriteSet = list(writeSet ?? event.writeSet);
    if (normalizedWriteSet.length === 0 && kind !== 'merge') {
      normalizedWriteSet.push(`${kind}:${subject}`);
    }

    return {
      id: event.id || hash({ ...event, parents, n:this.#events.length }).slice(0, 24),
      at: event.at || new Date().toISOString(),
      kind,
      subject,
      payload: event.payload ?? null,
      evidence: event.evidence ?? null,
      epistemic: event.epistemic || 'observed',
      parents:[...parents],
      baseRevision,
      readSet:list(readSet ?? event.readSet),
      writeSet:normalizedWriteSet,
      scope:scope || event.scope || 'worldline',
      reconciliation
    };
  }

  #store(event, {
    parents,
    baseRevision,
    readSet = null,
    writeSet = null,
    scope = null,
    reconciliation = 'DIRECT',
    canonical = true,
    cellId = null
  }) {
    const normalized = this.#normalize(event,{
      parents,
      baseRevision,
      readSet,
      writeSet,
      scope,
      reconciliation
    });

    if (this.#ids.has(normalized.id)) {
      const existingRevision = this.#eventRevision.get(normalized.id) || this.#revision;
      if (cellId) this.#cellHeads.set(cellId, existingRevision);
      return {
        ok:true,
        duplicate:true,
        revision:existingRevision,
        event:this.get(normalized.id),
        reconciliation:'IDEMPOTENT'
      };
    }

    const revision = hash({ parents, event:normalized }).slice(0, 24);
    const stored = { ...normalized, revision };
    this.#events.push(stored);
    this.#ids.add(stored.id);
    this.#eventRevision.set(stored.id, revision);
    this.#revisions.set(revision,{
      revision,
      eventId:stored.id,
      event:stored,
      parents:[...parents]
    });

    for (const parent of parents) this.#heads.delete(parent);
    this.#heads.add(revision);
    if (canonical) this.#revision = revision;
    if (cellId) this.#cellHeads.set(cellId, revision);

    return {
      ok:true,
      duplicate:false,
      revision,
      event:clone(stored),
      reconciliation
    };
  }

  append(event, expectedRevision = this.#revision) {
    if (expectedRevision !== this.#revision) {
      return { ok:false, code:'STALE_REVISION', expected:this.#revision, got:expectedRevision };
    }
    if (event?.id && this.#ids.has(event.id)) {
      return { ok:true, duplicate:true, revision:this.#revision, event:this.get(event.id) };
    }
    return this.#store(event,{
      parents:[expectedRevision],
      baseRevision:expectedRevision,
      reconciliation:'LINEAR_APPEND',
      canonical:true
    });
  }

  #ancestryRevisions(head) {
    if (!this.#revisions.has(head)) return [];
    const seen = new Set();
    const ordered = [];
    const visit = revision => {
      if (seen.has(revision)) return;
      seen.add(revision);
      const record = this.#revisions.get(revision);
      if (!record) return;
      for (const parent of record.parents || []) visit(parent);
      ordered.push(revision);
    };
    visit(head);
    return ordered;
  }

  #eventsBetween(baseRevision, headRevision) {
    const base = new Set(this.#ancestryRevisions(baseRevision));
    return this.#ancestryRevisions(headRevision)
      .filter(revision => revision !== 'root' && !base.has(revision))
      .map(revision => this.#revisions.get(revision)?.event)
      .filter(Boolean);
  }

  #conflicts(candidate, existingEvents = []) {
    const out = [];
    const candidateRead = list(candidate.readSet);
    const candidateWrite = list(candidate.writeSet?.length ? candidate.writeSet : [`${candidate.kind || 'observation'}:${candidate.subject || 'system'}`]);

    for (const existing of existingEvents) {
      const existingRead = list(existing.readSet);
      const existingWrite = list(existing.writeSet);
      const writeWrite = intersects(candidateWrite, existingWrite);
      const writeRead = intersects(candidateWrite, existingRead);
      const readWrite = intersects(candidateRead, existingWrite);
      const sameValue =
        writeWrite &&
        candidate.kind === existing.kind &&
        candidate.subject === existing.subject &&
        stable(candidate.payload ?? null) === stable(existing.payload ?? null);

      if ((writeWrite && !sameValue) || writeRead || readWrite) {
        out.push({
          eventId:existing.id,
          revision:existing.revision,
          writeWrite,
          writeRead,
          readWrite
        });
      }
    }
    return out;
  }

  commit(event, {
    baseRevision = null,
    cellId = 'cell:anonymous',
    readSet = null,
    writeSet = null,
    scope = null,
    strategy = 'auto'
  } = {}) {
    const base = baseRevision || this.#cellHeads.get(cellId) || this.#revision;
    if (!this.#revisions.has(base)) {
      return { ok:false, code:'UNKNOWN_BASE_REVISION', baseRevision:base };
    }

    if (event?.id && this.#ids.has(event.id)) {
      const revision = this.#eventRevision.get(event.id);
      this.#cellHeads.set(cellId, revision);
      return {
        ok:true,
        duplicate:true,
        revision,
        event:this.get(event.id),
        reconciliation:'IDEMPOTENT'
      };
    }

    if (base === this.#revision) {
      return this.#store(event,{
        parents:[base],
        baseRevision:base,
        readSet,
        writeSet,
        scope,
        reconciliation:'DIRECT',
        canonical:true,
        cellId
      });
    }

    if (strategy === 'reject') {
      return { ok:false, code:'STALE_REVISION', expected:this.#revision, got:base };
    }

    if (strategy === 'branch') {
      return this.#store(event,{
        parents:[base],
        baseRevision:base,
        readSet,
        writeSet,
        scope,
        reconciliation:'BRANCH',
        canonical:false,
        cellId
      });
    }

    const candidate = this.#normalize(event,{
      parents:[base],
      baseRevision:base,
      readSet,
      writeSet,
      scope,
      reconciliation:'CANDIDATE'
    });
    const concurrent = this.#eventsBetween(base, this.#revision);
    const conflicts = this.#conflicts(candidate, concurrent);

    if (conflicts.length > 0) {
      const branch = this.#store(event,{
        parents:[base],
        baseRevision:base,
        readSet,
        writeSet,
        scope,
        reconciliation:'CONFLICT_BRANCH',
        canonical:false,
        cellId
      });
      return {
        ok:false,
        code:'CONFLICT',
        baseRevision:base,
        canonicalRevision:this.#revision,
        branchRevision:branch.revision,
        conflicts,
        event:branch.event
      };
    }

    return this.#store(event,{
      parents:[this.#revision],
      baseRevision:base,
      readSet,
      writeSet,
      scope,
      reconciliation:'REBASE',
      canonical:true,
      cellId
    });
  }

  reconcile({
    sourceRevision,
    targetRevision = this.#revision,
    cellId = 'cell:reconciler',
    resolution = null
  } = {}) {
    if (!this.#revisions.has(sourceRevision)) {
      return { ok:false, code:'UNKNOWN_SOURCE_REVISION', sourceRevision };
    }
    if (!this.#revisions.has(targetRevision)) {
      return { ok:false, code:'UNKNOWN_TARGET_REVISION', targetRevision };
    }
    if (sourceRevision === targetRevision) {
      return { ok:true, duplicate:true, revision:targetRevision, reconciliation:'ALREADY_RECONCILED' };
    }

    const sourceAncestry = new Set(this.#ancestryRevisions(sourceRevision));
    const targetAncestry = new Set(this.#ancestryRevisions(targetRevision));
    const sourceOnly = this.#ancestryRevisions(sourceRevision)
      .filter(revision => revision !== 'root' && !targetAncestry.has(revision))
      .map(revision => this.#revisions.get(revision)?.event)
      .filter(Boolean);
    const targetOnly = this.#ancestryRevisions(targetRevision)
      .filter(revision => revision !== 'root' && !sourceAncestry.has(revision))
      .map(revision => this.#revisions.get(revision)?.event)
      .filter(Boolean);

    const conflicts = [];
    for (const event of sourceOnly) {
      conflicts.push(...this.#conflicts(event, targetOnly).map(conflict => ({
        sourceEventId:event.id,
        ...conflict
      })));
    }

    if (conflicts.length > 0 && !resolution) {
      return {
        ok:false,
        code:'CONFLICT',
        sourceRevision,
        targetRevision,
        conflicts
      };
    }

    const mergeEvent = resolution || {
      id:`merge:${hash({ sourceRevision, targetRevision }).slice(0, 20)}`,
      kind:'merge',
      subject:'worldline',
      payload:{ sourceRevision, targetRevision },
      evidence:{ mode:'typed-reconciliation', conflictCount:conflicts.length },
      epistemic:'verified',
      readSet:[],
      writeSet:[]
    };

    return this.#store(mergeEvent,{
      parents:[targetRevision, sourceRevision],
      baseRevision:targetRevision,
      readSet:mergeEvent.readSet || [],
      writeSet:mergeEvent.writeSet || [],
      scope:mergeEvent.scope || 'worldline',
      reconciliation:resolution ? 'RESOLUTION' : 'MERGE',
      canonical:true,
      cellId
    });
  }

  get(id) {
    const event = this.#events.find(item => item.id === id);
    return event ? clone(event) : null;
  }

  materialize(head = this.#revision) {
    if (!this.#revisions.has(head)) {
      return {
        revision:head,
        error:'UNKNOWN_REVISION',
        facts:{}, tasks:{}, intents:{}, failures:{}, capabilities:{}, receipts:{}
      };
    }

    const state = { facts:{}, tasks:{}, intents:{}, failures:{}, capabilities:{}, receipts:{} };
    for (const revision of this.#ancestryRevisions(head)) {
      if (revision === 'root') continue;
      const e = this.#revisions.get(revision)?.event;
      if (!e) continue;
      if (e.kind === 'fact') state.facts[e.subject] = clone(e.payload);
      if (e.kind === 'task') state.tasks[e.subject] = clone(e.payload);
      if (e.kind === 'intent') state.intents[e.subject] = clone(e.payload);
      if (e.kind === 'failure') state.failures[e.subject] = clone(e.payload);
      if (e.kind === 'capability') state.capabilities[e.subject] = clone(e.payload);
      if (e.kind === 'receipt') state.receipts[e.subject] = clone(e.payload);
    }
    return { revision:head, ...state };
  }
}
