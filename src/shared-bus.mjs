import crypto from 'node:crypto';

// MondayID shared state bus: 9-field envelopes stored as Worldline v4 events.
// The bus records; it never executes. Consequential proposals are GATED.
export const BUS_PREDICATE = 'mondayid_bus_envelope_v1';
export const ENVELOPE_FIELDS = Object.freeze(['eventId','sourceHost','parentVersion','goalId','observation','evidence','proposal','nextAction','status']);
export const STATUSES = Object.freeze(['CANDIDATE','ACK','REJECTED','GATED','SUPERSEDED']);
export const GENESIS = 'GENESIS';

const RISK_FLAGS = ['moneyMovement','spending','binding','usesLegalIdentity','publicFacing','externalPartyContact','requiresHumanPresence','credentialBinding','deletion','irreversible'];
const RISK_WORDS = /\b(pay|payment|purchase|buy|subscribe|upgrade|delete|remove|force-?push|send (an )?(email|message|sms)|post publicly|publish|accept (the )?terms|password|credential|transfer money)\b|оплат|купи|удал|отправ\w* (письм|сообщ)|пароль|приня\w* услови/i;

const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
  : JSON.stringify(v);
export const storageIdFor = env => `E-BUS-${crypto.createHash('sha256').update(stable(env)).digest('hex').slice(0,32)}`;

function hasRisk(v, d = 0) {
  if (v == null || d > 8) return false;
  if (typeof v === 'string') return RISK_WORDS.test(v);
  if (typeof v !== 'object') return false;
  if (!Array.isArray(v)) {
    if (RISK_FLAGS.some(f => v[f] === true)) return true;
    if (v.costIls != null && v.costIls !== 0) return true;
    if (v.costUsd != null && v.costUsd !== 0) return true;
  }
  return Object.values(v).some(x => hasRisk(x, d + 1));
}

export function validateEnvelope(env) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) return { ok:false, code:'ENVELOPE_NOT_OBJECT' };
  const extra = Object.keys(env).filter(k => !ENVELOPE_FIELDS.includes(k));
  if (extra.length) return { ok:false, code:'ENVELOPE_UNKNOWN_FIELDS', extra };
  for (const f of ENVELOPE_FIELDS) if (env[f] === undefined || env[f] === null || env[f] === '') return { ok:false, code:'ENVELOPE_MISSING_FIELD', field:f };
  for (const f of ['eventId','sourceHost','parentVersion','goalId','status']) if (typeof env[f] !== 'string' || env[f].length > 200) return { ok:false, code:'ENVELOPE_BAD_FIELD', field:f };
  if (!STATUSES.includes(env.status)) return { ok:false, code:'ENVELOPE_BAD_STATUS' };
  if (JSON.stringify(env).length > 32000) return { ok:false, code:'ENVELOPE_TOO_LARGE' };
  return { ok:true };
}

// Fail closed: anything consequential, or any status claim we cannot verify, becomes GATED.
export function classifyAuthority(env) {
  if (hasRisk(env.proposal) || hasRisk(env.nextAction)) return { status:'GATED', reason:'CONSEQUENTIAL_PROPOSAL_REQUIRES_OWNER' };
  return { status:env.status, reason:null };
}

export function busEvents(snapshot) {
  const out = [];
  for (const e of snapshot?.events || []) {
    if (e?.predicate !== BUS_PREDICATE) continue;
    let env; try { env = JSON.parse(e.valueJson); } catch { continue; }
    out.push({ storageId:e.eventId, at:e.timestampIso ?? null, host:e.host ?? null, envelope:env });
  }
  return out;
}
export const headOf = events => events.length ? events[events.length - 1].storageId : GENESIS;

export class SharedBus {
  constructor({ baseUrl, writerToken, readerToken, fetchImpl = globalThis.fetch, now = () => new Date().toISOString() } = {}) {
    Object.assign(this, { baseUrl, writerToken, readerToken, fetchImpl, now });
  }
  rh() { return this.readerToken ? { headers:{ authorization:`Bearer ${this.readerToken}` } } : undefined; }
  async list(limit = 100) {
    if (!this.baseUrl) return { ok:false, code:'NO_WORLDLINE_URL' };
    const url = new URL('/worldline/v4/snapshot', this.baseUrl); url.searchParams.set('limit', String(limit));
    let r; try { r = await this.fetchImpl(url, this.rh()); } catch (e) { return { ok:false, code:'BUS_READ_FAILED', error:String(e) }; }
    if (!r?.ok) return { ok:false, code:'BUS_READ_HTTP', status:r?.status ?? null };
    let s; try { s = await r.json(); } catch { return { ok:false, code:'BUS_READ_JSON' }; }
    if (s?.readOnly !== true || !Array.isArray(s?.events)) return { ok:false, code:'BUS_SNAPSHOT_SCHEMA' };
    const events = busEvents(s);
    return { ok:true, head:headOf(events), events };
  }
  async get(storageId) {
    const url = new URL('/worldline/v4/event', this.baseUrl); url.searchParams.set('eventId', storageId);
    let r; try { r = await this.fetchImpl(url, this.rh()); } catch (e) { return { ok:false, code:'BUS_READBACK_FAILED' }; }
    if (!r?.ok) return { ok:false, code:'BUS_READBACK_HTTP', status:r?.status ?? null };
    let b; try { b = await r.json(); } catch { return { ok:false, code:'BUS_READBACK_JSON' }; }
    return { ok:Boolean(b?.event), event:b?.event ?? null, conflicts:Array.isArray(b?.conflicts) ? b.conflicts : [] };
  }
  async post(input) {
    const v = validateEnvelope(input); if (!v.ok) return v;
    if (!this.writerToken) return { ok:false, code:'NO_WORLDLINE_WRITER_TOKEN' };
    const auth = classifyAuthority(input);
    const env = { ...input, status:auth.status };
    const storageId = storageIdFor(env);
    const cur = await this.list(); if (!cur.ok) return cur;
    const dup = cur.events.find(e => e.storageId === storageId || e.envelope?.eventId === env.eventId);
    if (dup) return { ok:dup.storageId === storageId, code:dup.storageId === storageId ? 'DUPLICATE' : 'EVENT_ID_REUSED', storageId:dup.storageId, head:cur.head };
    if (env.parentVersion !== cur.head) return { ok:false, code:'STALE_PARENT', expected:cur.head, got:env.parentVersion };
    const valueJson = JSON.stringify(env);
    const event = { eventId:storageId, timestampIso:this.now(), subject:env.goalId, predicate:BUS_PREDICATE, valueJson, epistemicStatus:'CANDIDATE', sourceRef:`bus:${env.sourceHost}`, host:env.sourceHost, identityFingerprint:'mondayid:bus:v1' };
    let r; try { r = await this.fetchImpl(new URL('/worldline/v4/append', this.baseUrl), { method:'POST', headers:{ authorization:`Bearer ${this.writerToken}`, 'content-type':'application/json' }, body:JSON.stringify(event) }); }
    catch (e) { return { ok:false, code:'BUS_WRITE_FAILED' }; }
    let rec = null; try { rec = await r.json(); } catch {}
    if (!r?.ok || rec?.ok !== true) return { ok:false, code:'BUS_WRITE_REJECTED', status:r?.status ?? null };
    const back = await this.get(storageId);
    const verified = back.ok && back.event?.valueJson === valueJson && back.conflicts.length === 0;
    return { ok:verified, code:verified ? 'VERIFIED' : 'READBACK_MISMATCH', storageId, status:env.status, gatedReason:auth.reason, head:storageId };
  }
  async ack({ targetEventId, sourceHost, parentVersion, eventId, evidence, verdict = 'ACK' }) {
    if (!['ACK','REJECTED','SUPERSEDED'].includes(verdict)) return { ok:false, code:'BAD_VERDICT' };
    return this.post({ eventId, sourceHost, parentVersion, goalId:`ack:${targetEventId}`, observation:`${verdict} of ${targetEventId}`, evidence:evidence ?? 'none', proposal:{ target:targetEventId }, nextAction:'none', status:verdict });
  }
}
