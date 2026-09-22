import { Worldline } from './worldline.mjs';

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
      verificationReceipt: event.verificationReceipt ?? null
    },
    epistemic: String(event.epistemicStatus || event.epistemic || 'observed').toLowerCase()
  };
}

export async function fetchWorldlineSnapshot({ baseUrl, limit = 10, fetchImpl = globalThis.fetch } = {}) {
  if (!baseUrl) return { ok:false, code:'NO_WORLDLINE_URL' };
  if (typeof fetchImpl !== 'function') return { ok:false, code:'NO_FETCH' };

  const url = new URL('/worldline/snapshot', baseUrl);
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

  if (snapshot?.schema !== 'mondayid.worldline.snapshot.v0.3.0' || snapshot?.readOnly !== true || !Array.isArray(snapshot?.events)) {
    return { ok:false, code:'WORLDLINE_SCHEMA_MISMATCH', snapshot };
  }

  return { ok:true, url:String(url), snapshot };
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
  const receipt = worldline.append({
    id: 'remote-snapshot:' + (snapshot?.generatedAtIso || 'unknown'),
    kind: 'receipt',
    subject: 'remote-worldline-snapshot',
    payload: {
      schema: snapshot?.schema,
      generatedAtIso: snapshot?.generatedAtIso || null,
      imported,
      conflictEventPresent: Boolean(snapshot?.conflictProbe?.event),
      conflictCount: conflicts.length
    },
    evidence: { transport:'http-readonly' },
    epistemic: 'verified'
  }, revision);

  if (!receipt.ok) return { ...receipt, imported, worldline };
  return { ok:true, imported, revision:receipt.revision, worldline };
}

export async function recoverWorldline(options = {}) {
  const fetched = await fetchWorldlineSnapshot(options);
  if (!fetched.ok) return fetched;
  const seeded = seedWorldlineFromSnapshot(fetched.snapshot, options.worldline || new Worldline());
  return { ...seeded, snapshot:fetched.snapshot, url:fetched.url };
}
