import { Worldline } from './worldline.mjs';

const TRUSTED_SCHEMA = 'mondayid.worldline.snapshot.v0.4.0';
const LEGACY_SCHEMA = 'mondayid.worldline.snapshot.v0.3.0';

const parseValue = (value) => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
};

export function externalEventToLocal(event = {}) {
  return {
    id: event.eventId || event.id,
    at: event.timestampIso || event.at,
    kind: event.kind || 'fact',
    subject: event.subject || event.eventId || event.id || 'external',
    payload: {
      predicate: event.predicate ?? null,
      value: parseValue(event.valueJson ?? event.payload ?? null),
      host: event.host ?? null
    },
    evidence: {
      sourceRef: event.sourceRef ?? null,
      verificationReceipt: event.verificationReceipt ?? null,
      writerKeyId: event.writerKeyId ?? null
    },
    epistemic: String(event.epistemicStatus || event.epistemic || 'observed').toLowerCase()
  };
}

export async function fetchWorldlineSnapshot({
  baseUrl,
  limit = 10,
  trust = 'trusted',
  fetchImpl = globalThis.fetch
} = {}) {
  if (!baseUrl) return { ok:false, code:'NO_WORLDLINE_URL' };
  if (typeof fetchImpl !== 'function') return { ok:false, code:'NO_FETCH' };
  if (!['trusted','legacy'].includes(trust)) return { ok:false, code:'INVALID_TRUST_MODE' };

  const trusted = trust === 'trusted';
  const url = new URL(trusted ? '/worldline/v4/snapshot' : '/worldline/snapshot', baseUrl);
  url.searchParams.set('limit', String(limit));

  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    return { ok:false, code:'WORLDLINE_FETCH_FAILED', error:String(error) };
  }

  if (!response?.ok) {
    return { ok:false, code:'WORLDLINE_HTTP_ERROR', status:response?.status ?? null };
  }

  let snapshot;
  try {
    snapshot = await response.json();
  } catch (error) {
    return { ok:false, code:'WORLDLINE_INVALID_JSON', error:String(error) };
  }

  const expectedSchema = trusted ? TRUSTED_SCHEMA : LEGACY_SCHEMA;
  const trustedMarkerOk = !trusted || snapshot?.trust === 'AUTHENTICATED_MACHINE_WRITER';
  if (
    snapshot?.schema !== expectedSchema ||
    snapshot?.readOnly !== true ||
    !Array.isArray(snapshot?.events) ||
    !trustedMarkerOk
  ) {
    return { ok:false, code:'WORLDLINE_SCHEMA_MISMATCH', trust, snapshot };
  }

  return { ok:true, trust, url:String(url), snapshot };
}

export function seedWorldlineFromSnapshot(snapshot, worldline = new Worldline()) {
  let revision = worldline.revision();
  let imported = 0;

  for (const external of snapshot?.events || []) {
    const local = externalEventToLocal(external);
    if (!local.id) continue;
    const out = worldline.append(local, revision);
    if (!out.ok) return { ...out, imported, worldline };
    revision = out.revision;
    if (!out.duplicate) imported += 1;
  }

  const conflicts = snapshot?.conflictProbe?.conflicts || [];
  const trusted = snapshot?.schema === TRUSTED_SCHEMA && snapshot?.trust === 'AUTHENTICATED_MACHINE_WRITER';
  const receipt = worldline.append({
    id: 'remote-snapshot:' + (snapshot?.generatedAtIso || 'unknown'),
    kind: 'receipt',
    subject: 'remote-worldline-snapshot',
    payload: {
      schema: snapshot?.schema,
      generatedAtIso: snapshot?.generatedAtIso || null,
      imported,
      trust: snapshot?.trust || 'LEGACY_UNAUTHENTICATED_STREAM',
      trusted,
      conflictEventPresent: Boolean(snapshot?.conflictProbe?.event),
      conflictCount: conflicts.length
    },
    evidence: {
      transport: trusted ? 'http-trusted-machine-read' : 'http-legacy-readonly'
    },
    epistemic: 'verified'
  }, revision);

  if (!receipt.ok) return { ...receipt, imported, worldline };
  return { ok:true, imported, revision:receipt.revision, worldline };
}

export async function recoverWorldline(options = {}) {
  const fetched = await fetchWorldlineSnapshot(options);
  if (!fetched.ok) return fetched;
  const seeded = seedWorldlineFromSnapshot(fetched.snapshot, options.worldline || new Worldline());
  return { ...seeded, trust:fetched.trust, snapshot:fetched.snapshot, url:fetched.url };
}

export const worldlineSchemas = Object.freeze({
  trusted:TRUSTED_SCHEMA,
  legacy:LEGACY_SCHEMA
});
