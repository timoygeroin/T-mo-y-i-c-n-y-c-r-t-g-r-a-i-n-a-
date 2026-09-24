import crypto from 'node:crypto';

const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value);

const digest = (value) => crypto.createHash('sha256').update(stable(value)).digest('hex').slice(0, 24);
const clone = value => value == null ? value : structuredClone(value);

export function actionIdentity(action = {}) {
  const route = action.routeCandidate?.id ?? action.routeCandidate?.key ?? action.routeCandidate ?? null;
  return `action:${digest({
    id: action.id ?? null,
    objectiveId: action.objectiveId ?? null,
    sourceSignal: action.sourceSignal ?? null,
    domain: action.domain ?? null,
    effect: action.effect ?? null,
    route
  })}`;
}

export class ActionLedger {
  constructor({ now = () => Date.now(), defaultLeaseMs = 30_000 } = {}) {
    this.now = now;
    this.defaultLeaseMs = defaultLeaseMs;
    this.records = new Map();
  }

  prepare(action, { cellId = 'cell:unknown', idempotencyKey = null } = {}) {
    const actionKey = idempotencyKey || actionIdentity(action);
    const existing = this.records.get(actionKey);
    if (existing) return { ok:true, duplicate:true, actionKey, record:clone(existing) };

    const record = {
      actionKey,
      action:clone(action),
      state:'PREPARED',
      owner:null,
      fence:0,
      token:null,
      leaseUntil:0,
      preparedBy:cellId,
      attempts:0,
      outcome:null,
      verification:null,
      history:[{ state:'PREPARED', cellId, at:this.now() }]
    };
    this.records.set(actionKey, record);
    return { ok:true, duplicate:false, actionKey, record:clone(record) };
  }

  reserve(actionKey, { cellId = 'cell:unknown', leaseMs = this.defaultLeaseMs } = {}) {
    const record = this.records.get(actionKey);
    if (!record) return { ok:false, code:'ACTION_NOT_PREPARED', actionKey };
    if (record.state === 'COMMITTED') return { ok:true, reused:true, actionKey, record:clone(record) };
    if (record.state === 'AMBIGUOUS') return { ok:false, code:'ACTION_AMBIGUOUS', actionKey, record:clone(record) };
    if (record.state === 'VERIFIED') return { ok:true, reused:true, verifiedOnly:true, actionKey, record:clone(record) };

    const now = this.now();
    if (record.state === 'EXECUTING' && record.leaseUntil <= now) {
      record.state = 'AMBIGUOUS';
      record.history.push({ state:'AMBIGUOUS', cellId, at:now, reason:'EXECUTION_LEASE_EXPIRED' });
      return { ok:false, code:'ACTION_AMBIGUOUS', actionKey, record:clone(record) };
    }

    if ((record.state === 'RESERVED' || record.state === 'EXECUTING') && record.leaseUntil > now) {
      if (record.owner === cellId) {
        return { ok:true, reusedReservation:true, actionKey, token:record.token, record:clone(record) };
      }
      return {
        ok:false,
        code:'ACTION_RESERVED',
        actionKey,
        owner:record.owner,
        leaseUntil:record.leaseUntil,
        record:clone(record)
      };
    }

    record.fence += 1;
    record.owner = cellId;
    record.token = `${actionKey}#${record.fence}@${cellId}`;
    record.leaseUntil = now + Math.max(1, Number(leaseMs) || this.defaultLeaseMs);
    record.state = 'RESERVED';
    record.attempts += 1;
    record.history.push({ state:'RESERVED', cellId, fence:record.fence, at:now, leaseUntil:record.leaseUntil });
    return { ok:true, reused:false, actionKey, token:record.token, fence:record.fence, record:clone(record) };
  }

  #owned(actionKey, token) {
    const record = this.records.get(actionKey);
    if (!record) return { ok:false, code:'ACTION_NOT_PREPARED' };
    if (!token || record.token !== token) return { ok:false, code:'STALE_ACTION_FENCE', record };
    return { ok:true, record };
  }

  start(actionKey, token) {
    const owned = this.#owned(actionKey, token);
    if (!owned.ok) return { ok:false, code:owned.code };
    const record = owned.record;
    if (record.state !== 'RESERVED') return { ok:false, code:'ACTION_NOT_RESERVED', state:record.state };
    record.state = 'EXECUTING';
    record.history.push({ state:'EXECUTING', cellId:record.owner, fence:record.fence, at:this.now() });
    return { ok:true, record:clone(record) };
  }

  fail(actionKey, token, outcome = null) {
    const owned = this.#owned(actionKey, token);
    if (!owned.ok) return { ok:false, code:owned.code };
    const record = owned.record;
    record.state = 'FAILED';
    record.outcome = clone(outcome);
    record.history.push({ state:'FAILED', cellId:record.owner, fence:record.fence, at:this.now() });
    record.owner = null;
    record.token = null;
    record.leaseUntil = 0;
    return { ok:true, record:clone(record) };
  }

  ambiguous(actionKey, token, outcome = null, reason = 'READBACK_UNRESOLVED') {
    const owned = this.#owned(actionKey, token);
    if (!owned.ok) return { ok:false, code:owned.code };
    const record = owned.record;
    record.state = 'AMBIGUOUS';
    record.outcome = clone(outcome);
    record.history.push({ state:'AMBIGUOUS', cellId:record.owner, fence:record.fence, at:this.now(), reason });
    record.owner = null;
    record.token = null;
    record.leaseUntil = 0;
    return { ok:true, record:clone(record) };
  }

  verify(actionKey, token, { verification, outcome } = {}) {
    const owned = this.#owned(actionKey, token);
    if (!owned.ok) return { ok:false, code:owned.code };
    const record = owned.record;
    if (verification?.ok !== true) {
      return this.ambiguous(actionKey, token, outcome, verification?.code || 'READBACK_UNRESOLVED');
    }
    record.state = 'VERIFIED';
    record.verification = clone(verification);
    record.outcome = clone(outcome);
    record.history.push({ state:'VERIFIED', cellId:record.owner, fence:record.fence, at:this.now() });
    return { ok:true, record:clone(record) };
  }

  commit(actionKey, token = null) {
    const record = this.records.get(actionKey);
    if (!record) return { ok:false, code:'ACTION_NOT_PREPARED' };
    if (record.state === 'COMMITTED') return { ok:true, duplicate:true, record:clone(record) };
    if (record.state !== 'VERIFIED') return { ok:false, code:'ACTION_NOT_VERIFIED', state:record.state };
    if (token && record.token !== token) return { ok:false, code:'STALE_ACTION_FENCE' };
    record.state = 'COMMITTED';
    record.history.push({ state:'COMMITTED', cellId:record.owner, fence:record.fence, at:this.now() });
    record.owner = null;
    record.token = null;
    record.leaseUntil = 0;
    return { ok:true, record:clone(record) };
  }

  read(actionKey) {
    const record = this.records.get(actionKey);
    return record ? clone(record) : null;
  }

  snapshot() {
    return [...this.records.values()].map(clone);
  }
}
