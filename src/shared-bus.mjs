import crypto from 'node:crypto';

// MondayID candidate inbox (bus v2, after CHATGPT-BUS-REVIEW-20261015-001).
// Inert: stores 9-field envelopes as Worldline v4 events, never executes, never
// promotes anything to canonical state. Canonical promotion needs storage-side CAS.
export const BUS_PREDICATE = 'mondayid_bus_envelope_v2';
export const BUS_SCHEMA = 'mondayid.bus.record.v2';
export const ENVELOPE_FIELDS = Object.freeze(['eventId','sourceHost','parentVersion','goalId','observation','evidence','proposal','nextAction','status']);
export const CLAIMS = Object.freeze(['CANDIDATE','ACK','NACK','SUPERSEDES']);
export const ACK_SCOPES = Object.freeze(['READ','PROCESSED','REJECTED']);
export const GENESIS = 'GENESIS';
// Typed operations that a future executor could consider. Everything else is UNKNOWN_DENY.
export const FREE_REVERSIBLE_KINDS = Object.freeze(['note','review_request','drive_doc_create','git_branch_commit','draft_pr_open','test_run']);

const SNAPSHOT_SCHEMA = 'mondayid.worldline.snapshot.v0.4.0';
const EVENT_SCHEMA = 'mondayid.worldline.event.v0.4.0';
const TRUST_MARKER = 'AUTHENTICATED_MACHINE_WRITER';
const RISK_FLAGS = ['moneyMovement','spending','binding','usesLegalIdentity','publicFacing','externalPartyContact','requiresHumanPresence','credentialBinding','deletion','irreversible'];
const RISK_WORDS = /\b(pay|payment|purchase|buy|subscribe|upgrade|delete|remove|force-?push|send (an )?(email|message|sms)|publish|accept (the )?terms|password|credential|transfer money)\b|оплат|купи|удал|отправ\w* (письм|сообщ)|пароль|приня\w* услови/i;
// Key/token shapes only. Quoting a forbidden action stays advisory, not a secret.
const SECRET_SHAPES = [
  /-----BEGIN [A-Z \t]*PRIVATE KEY-----/i,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}/,
  /\bAIza[0-9A-Za-z_-]{30,}/,
  /\bxox[abprscoe]-[A-Za-z0-9-]{10,}/,
  /\bxapp-[A-Za-z0-9-]{10,}/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\bnpm_[A-Za-z0-9]{36,}/,
  /\bglpat-[A-Za-z0-9_-]{20,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /\\?"private[_-]?key\\?"\s*:/i
];
const INVISIBLE = /[\u200B-\u200D\uFEFF\u2060\u180E\u202A-\u202E\u2066-\u2069]/g;

const stable = v => Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
  : JSON.stringify(v);
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
export const payloadHashOf = env => sha(stable(env));
// Stable key from eventId only (BUS-REVIEW-05): retries map to the same record.
export const storageIdFor = eventId => `E-BUS2-${sha(String(eventId)).slice(0,32)}`;
const claimOf = status => typeof status === 'string' ? status : status?.claim;
const explicitZero = n => typeof n === 'number' && Number.isFinite(n) && n === 0;

function hasSecret(raw) {
  const text = String(raw).replace(INVISIBLE, '');
  return SECRET_SHAPES.some(re => re.test(text));
}

// JSON.stringify would silently turn NaN/Infinity into null and drop undefined,
// so the stored envelope would no longer be the one we hashed.
function rejectShape(v, d = 0) {
  if (d > 12) return 'ENVELOPE_TOO_DEEP';
  if (typeof v === 'number' && !Number.isFinite(v)) return 'ENVELOPE_NON_FINITE';
  if (typeof v === 'bigint' || typeof v === 'function' || typeof v === 'symbol') return 'ENVELOPE_BAD_FIELD';
  if (!v || typeof v !== 'object') return null;
  for (const x of Object.values(v)) {
    if (x === undefined) return 'ENVELOPE_UNDEFINED';
    const bad = rejectShape(x, d + 1);
    if (bad) return bad;
  }
  return null;
}

function scan(v, d = 0, acc = { flags:new Set(), words:false, truncated:false }) {
  if (v == null) return acc;
  // An unscanned remainder cannot be classified as free.
  if (d > 8) { acc.truncated = true; return acc; }
  if (typeof v === 'string') { if (RISK_WORDS.test(v)) acc.words = true; return acc; }
  if (typeof v !== 'object') return acc;
  if (!Array.isArray(v)) {
    for (const f of RISK_FLAGS) if (v[f] === true) acc.flags.add(f);
    for (const c of ['costIls','costUsd']) if (v[c] != null && v[c] !== 0) acc.flags.add(c);
  }
  for (const x of Object.values(v)) scan(x, d + 1, acc);
  return acc;
}

export function validateEnvelope(env) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) return { ok:false, code:'ENVELOPE_NOT_OBJECT' };
  const extra = Object.keys(env).filter(k => !ENVELOPE_FIELDS.includes(k));
  if (extra.length) return { ok:false, code:'ENVELOPE_UNKNOWN_FIELDS', extra };
  for (const f of ENVELOPE_FIELDS) if (env[f] === undefined || env[f] === null || env[f] === '') return { ok:false, code:'ENVELOPE_MISSING_FIELD', field:f };
  for (const f of ['eventId','sourceHost','parentVersion','goalId']) if (typeof env[f] !== 'string' || env[f].length > 200) return { ok:false, code:'ENVELOPE_BAD_FIELD', field:f };
  if (!CLAIMS.includes(claimOf(env.status))) return { ok:false, code:'ENVELOPE_BAD_STATUS' };
  const next = env.nextAction;
  if (!next || typeof next !== 'object' || Array.isArray(next) || typeof next.recipient !== 'string' || !next.recipient || typeof next.action !== 'string' || !next.action) {
    return { ok:false, code:'ENVELOPE_BAD_FIELD', field:'nextAction' };
  }
  const shape = rejectShape(env);
  if (shape) return { ok:false, code:shape };
  let raw;
  try { raw = JSON.stringify(env); }
  catch { return { ok:false, code:'ENVELOPE_NOT_SERIALIZABLE' }; }
  if (raw.length > 32000) return { ok:false, code:'ENVELOPE_TOO_LARGE' };
  if (hasSecret(raw)) return { ok:false, code:'SECRET_IN_PAYLOAD' };
  return { ok:true };
}

// Policy is separate from the envelope and from delivery (BUS-REVIEW-02/06).
// The bus has no executor, so nothing is ever executable here; the class only
// tells a future executor what a re-check must start from. Unknown = deny.
// Structured risk flags anywhere in the envelope gate. Keyword hits stay advisory.
export function classifyPolicy(env) {
  const s = scan(env);
  const proposal = env.proposal;
  const op = proposal && typeof proposal === 'object' && !Array.isArray(proposal) ? proposal.operation : undefined;
  let operationClass;
  if (s.truncated || s.flags.size) operationClass = 'OWNER_GATE';
  else if (!op) operationClass = 'NO_OPERATION';
  else if (typeof op !== 'object' || Array.isArray(op) || !FREE_REVERSIBLE_KINDS.includes(op.kind)) operationClass = 'UNKNOWN_DENY';
  else if (op.reversible === true && explicitZero(op.costUsd) && (op.costIls === undefined || explicitZero(op.costIls))) operationClass = 'FREE_REVERSIBLE_CANDIDATE';
  else operationClass = 'OWNER_GATE';
  return { executable:false, executor:'NONE', operationClass, riskFlags:[...s.flags].sort(), advisoryRiskWords:s.words };
}

function idempotencyResult(record, payloadHash, storageId) {
  const recomputed = record?.envelope ? payloadHashOf(record.envelope) : null;
  if (recomputed && recomputed === payloadHash && record.payloadHash === recomputed) {
    return { ok:true, code:'DUPLICATE', storageId, payloadHash };
  }
  return { ok:false, code:'IDEMPOTENCY_CONFLICT', storageId, storedHash:recomputed, payloadHash };
}

export function decodeRecords(snapshot) {
  const out = [];
  for (const e of snapshot?.events || []) {
    if (e?.predicate !== BUS_PREDICATE) continue;
    let rec; try { rec = JSON.parse(e.valueJson); } catch { continue; }
    if (rec?.schema !== BUS_SCHEMA || !rec.envelope) continue;
    out.push({ storageId:e.eventId, at:e.timestampIso ?? null, ...rec });
  }
  return out;
}

// Deterministic per-goal projection (BUS-REVIEW-07/10): global order only for delivery;
// semantic version is per goal; forks (same parent twice) stay unresolved conflicts.
export function project(records) {
  const goals = {};
  const byHash = new Map(records.map(r => [r.storageId, r]));
  for (const r of records) {
    const g = goals[r.envelope.goalId] ??= { head:GENESIS, events:[], conflicts:[] };
    const sibling = g.events.find(x => x.parentVersion === r.envelope.parentVersion);
    if (sibling) g.conflicts.push({ parentVersion:r.envelope.parentVersion, branches:[sibling.storageId, r.storageId], status:'UNRESOLVED' });
    g.events.push({ storageId:r.storageId, parentVersion:r.envelope.parentVersion, claim:claimOf(r.envelope.status) });
    g.head = r.storageId;
  }
  const acks = {};
  for (const r of records) {
    const ref = r.envelope.proposal?.referenceEventId;
    if (['ACK','NACK'].includes(claimOf(r.envelope.status)) && byHash.has(ref)) (acks[ref] ??= []).push({ by:r.transport?.principal, scope:r.envelope.proposal.ackScope, storageId:r.storageId });
  }
  return { goals, acks };
}
export const goalHead = (records, goalId) => project(records).goals[goalId]?.head ?? GENESIS;

export class SharedBus {
  constructor({ baseUrl, writerToken, readerToken, fetchImpl = globalThis.fetch, now = () => new Date().toISOString(), snapshotLimit = 100 } = {}) {
    Object.assign(this, { baseUrl, writerToken, readerToken, fetchImpl, now, snapshotLimit });
  }
  rh() { return this.readerToken ? { headers:{ authorization:`Bearer ${this.readerToken}` } } : undefined; }
  async records() {
    if (!this.baseUrl) return { ok:false, code:'NO_WORLDLINE_URL' };
    const url = new URL('/worldline/v4/snapshot', this.baseUrl); url.searchParams.set('limit', String(this.snapshotLimit));
    let r; try { r = await this.fetchImpl(url, this.rh()); } catch { return { ok:false, code:'BUS_READ_FAILED' }; }
    if (!r?.ok) return { ok:false, code:'BUS_READ_HTTP', status:r?.status ?? null };
    let s; try { s = await r.json(); } catch { return { ok:false, code:'BUS_READ_JSON' }; }
    if (s?.schema !== SNAPSHOT_SCHEMA || s?.trust !== TRUST_MARKER || s?.readOnly !== true || !Array.isArray(s?.events)) return { ok:false, code:'BUS_SNAPSHOT_SCHEMA' };
    // R16: a bounded window is not the full history.
    return { ok:true, records:decodeRecords(s), complete:s.events.length < this.snapshotLimit, windowSize:s.events.length };
  }
  async list({ goalId, recipient, afterStorageId, limit = 50 } = {}) {
    const cur = await this.records(); if (!cur.ok) return cur;
    let recs = cur.records;
    if (afterStorageId) { const i = recs.findIndex(r => r.storageId === afterStorageId); if (i < 0) return { ok:false, code:'UNKNOWN_CURSOR' }; recs = recs.slice(i + 1); }
    if (goalId) recs = recs.filter(r => r.envelope.goalId === goalId);
    if (recipient) recs = recs.filter(r => r.envelope.nextAction?.recipient === recipient);
    const page = recs.slice(0, Math.max(1, Math.min(100, limit)));
    return { ok:true, complete:cur.complete, records:page, nextCursor:page.length ? page[page.length - 1].storageId : (afterStorageId ?? null), hasMore:recs.length > page.length, projection:project(cur.records) };
  }
  async get(storageId) {
    if (!this.baseUrl) return { ok:false, code:'NO_WORLDLINE_URL' };
    const url = new URL('/worldline/v4/event', this.baseUrl); url.searchParams.set('eventId', storageId);
    let r; try { r = await this.fetchImpl(url, this.rh()); } catch { return { ok:false, code:'BUS_READBACK_FAILED' }; }
    if (!r?.ok) return { ok:false, code:'BUS_READBACK_HTTP', status:r?.status ?? null };
    let b; try { b = await r.json(); } catch { return { ok:false, code:'BUS_READBACK_JSON' }; }
    if (!b?.event) return { ok:false, code:'NOT_FOUND' };
    if (b.schema !== EVENT_SCHEMA) return { ok:false, code:'BUS_READBACK_SCHEMA', event:b.event };
    let rec = null; try { rec = JSON.parse(b.event.valueJson); } catch {}
    const conflicts = Array.isArray(b.conflicts) ? b.conflicts : [];
    return { ok:rec?.schema === BUS_SCHEMA, code:rec?.schema === BUS_SCHEMA ? undefined : 'NOT_BUS_RECORD', event:b.event, record:rec, conflicts };
  }
  async post(envelope, auth = null) {
    if (!auth?.principal) return { ok:false, code:'UNAVAILABLE_AUTH' };
    const v = validateEnvelope(envelope); if (!v.ok) return v;
    if (auth.hostBound && envelope.sourceHost !== auth.principal) return { ok:false, code:'SOURCE_HOST_MISMATCH', principal:auth.principal, claimed:envelope.sourceHost };
    if (!this.writerToken) return { ok:false, code:'NO_WORLDLINE_WRITER_TOKEN' };
    const storageId = storageIdFor(envelope.eventId);
    const payloadHash = payloadHashOf(envelope);
    const cur = await this.records(); if (!cur.ok) return cur;
    const prior = cur.records.find(r => r.storageId === storageId);
    if (prior) return idempotencyResult(prior, payloadHash, storageId);
    // Snapshot windows can hide a write whose response was lost. The point read
    // is the idempotency source of truth before any second append.
    const looked = await this.get(storageId);
    if (looked.code !== 'NOT_FOUND') {
      if (!looked.ok || !looked.record) return { ok:false, code:looked.code || 'BUS_READBACK_FAILED', storageId, retrySafe:true };
      if (looked.conflicts.length) return { ok:false, code:'IDEMPOTENCY_CONFLICT', storageId, payloadHash };
      return idempotencyResult(looked.record, payloadHash, storageId);
    }
    if (!cur.complete) return { ok:false, code:'PARTIAL_SNAPSHOT', note:'cannot prove uniqueness or goal head from a truncated window' };
    const head = goalHead(cur.records, envelope.goalId);
    if (envelope.parentVersion !== head) return { ok:false, code:'STALE_PARENT', goalId:envelope.goalId, expected:head, got:envelope.parentVersion };
    const record = {
      schema:BUS_SCHEMA, envelope, payloadHash,
      transport:{ principal:auth.principal, hostBound:auth.hostBound === true, claimedSourceHost:envelope.sourceHost, receivedAt:this.now() },
      delivery:'STORED', policy:classifyPolicy(envelope)
    };
    const valueJson = JSON.stringify(record);
    const event = { eventId:storageId, timestampIso:record.transport.receivedAt, subject:envelope.goalId, predicate:BUS_PREDICATE, valueJson, epistemicStatus:'CANDIDATE', sourceRef:`bus:${auth.principal}`, host:auth.principal, identityFingerprint:'mondayid:bus:v2' };
    let r; try { r = await this.fetchImpl(new URL('/worldline/v4/append', this.baseUrl), { method:'POST', headers:{ authorization:`Bearer ${this.writerToken}`, 'content-type':'application/json' }, body:JSON.stringify(event) }); }
    catch { return { ok:false, code:'BUS_WRITE_FAILED', storageId, retrySafe:true }; }
    let rec = null; try { rec = await r.json(); } catch {}
    if (!r?.ok || rec?.ok !== true) return { ok:false, code:'BUS_WRITE_REJECTED', status:r?.status ?? null, storageId, retrySafe:true };
    const back = await this.get(storageId);
    const verified = back.ok && back.event?.valueJson === valueJson && back.event?.predicate === BUS_PREDICATE && back.event?.epistemicStatus === 'CANDIDATE' && back.conflicts.length === 0;
    return { ok:verified, code:verified ? 'STORED_READBACK_EXACT' : 'READBACK_MISMATCH', storageId, payloadHash, policy:record.policy, goalHead:storageId, note:'stored candidate; not promoted, not executed, not verified as true' };
  }
  async ack({ referenceStorageId, ackScope = 'READ', eventId, sourceHost, parentVersion, evidence, observation }, auth) {
    if (!ACK_SCOPES.includes(ackScope)) return { ok:false, code:'BAD_ACK_SCOPE' };
    const target = await this.get(String(referenceStorageId || ''));
    if (!target.ok) return { ok:false, code:'ACK_TARGET_NOT_FOUND' };
    return this.post({
      eventId, sourceHost, parentVersion, goalId:target.record.envelope.goalId,
      observation:observation ?? `${ackScope} ${referenceStorageId}`, evidence:evidence ?? [],
      proposal:{ referenceEventId:referenceStorageId, referencePayloadHash:target.record.payloadHash, ackScope },
      nextAction:{ recipient:target.record.transport.principal, action:'none' },
      status:{ claim:ackScope === 'REJECTED' ? 'NACK' : 'ACK' }
    }, auth);
  }
}
