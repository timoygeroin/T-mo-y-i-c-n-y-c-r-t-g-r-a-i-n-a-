import crypto from 'node:crypto';

const json = (res, status, body) => res.status(status).json(body);
const stable = value => Array.isArray(value) ? '[' + value.map(stable).join(',') + ']' :
  value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}' : JSON.stringify(value);
const safeEqual = (a, b) => {
  const x = Buffer.from(a || '', 'utf8'), y = Buffer.from(b || '', 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const parse = async response => { try { return await response.json(); } catch { return null; } };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return json(res, 405, { accepted:false, error:'METHOD_NOT_ALLOWED' });
  const secret = process.env.MONDAYID_CAPSULE_INGEST_SECRET;
  const base = process.env.MONDAYID_WORLDLINE_URL;
  const writer = process.env.MONDAYID_WORLDLINE_WRITER_TOKEN;
  const reader = process.env.MONDAYID_WORLDLINE_READ_TOKEN;
  if (!secret || !base || !writer || !reader) return json(res, 503, { accepted:false, error:'NOT_CONFIGURED' });
  const auth = req.headers.authorization || '';
  if (!safeEqual(auth, 'Bearer ' + secret)) return json(res, 401, { accepted:false, error:'UNAUTHORIZED' });
  const data = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return null; } })() : req.body;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return json(res, 400, { accepted:false, error:'INVALID_JSON' });
  const {event_id, source, revision, timestamp, payload} = data;
  if (typeof event_id !== 'string' || !/^[a-zA-Z0-9_.:-]{8,128}$/.test(event_id) ||
      source !== 'ios-monday' || !Number.isSafeInteger(revision) || revision < 0 ||
      typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp)) ||
      !payload || typeof payload !== 'object' || Array.isArray(payload) ||
      Buffer.byteLength(JSON.stringify(data)) > 16384)
    return json(res, 422, {accepted:false,error:'INVALID_CAPSULE'});
  // Reject replay outside a bounded clock window. Worldline itself deduplicates event IDs.
  if (Math.abs(Date.now() - Date.parse(timestamp)) > 300000)
    return json(res, 422, {accepted:false,error:'TIMESTAMP_OUT_OF_WINDOW'});
  const valueJson = stable({revision,payload});
  const event = {eventId:event_id,timestampIso:timestamp,subject:'ios-state-capsule',
    predicate:'state_capsule',valueJson,epistemicStatus:'OBSERVED',
    sourceRef:'ios-shortcuts',host:'ios-monday',identityFingerprint:'mondayid:ios:shortcuts:v1'};
  let origin;
  try { origin = new URL(base); if (origin.protocol !== 'https:') throw new Error('HTTPS_REQUIRED'); }
  catch { return json(res,503,{accepted:false,error:'INVALID_WORLDLINE_URL'}); }
  try {
    const write = await fetch(new URL('/worldline/v4/append',origin), {
      method:'POST',headers:{authorization:'Bearer '+writer,'content-type':'application/json'},
      body:JSON.stringify(event),signal:AbortSignal.timeout(8000)
    });
    const receipt = await parse(write);
    if (!write.ok || receipt?.ok !== true || !['APPENDED','DUPLICATE'].includes(receipt.status))
      return json(res,502,{accepted:false,error:'WORLDLINE_WRITE_UNCONFIRMED'});
    const readUrl = new URL('/worldline/v4/event',origin);
    readUrl.searchParams.set('eventId',event_id);
    const read = await fetch(readUrl,{headers:{authorization:'Bearer '+reader},signal:AbortSignal.timeout(8000)});
    const snapshot = await parse(read);
    const persisted = snapshot?.event;
    const exact = read.ok && snapshot?.schema === 'mondayid.worldline.event.v0.4.0' &&
      ['eventId','timestampIso','subject','predicate','valueJson','epistemicStatus',
        'sourceRef','host','identityFingerprint'].every(k => persisted?.[k] === event[k]) &&
      typeof persisted?.writerKeyId === 'string' && persisted.writerKeyId.length > 0 &&
      Array.isArray(snapshot?.conflicts) && snapshot.conflicts.length === 0;
    if (!exact) return json(res,502,{accepted:false,error:'WORLDLINE_READBACK_UNCONFIRMED'});
    const receipt_id = 'worldline:v4:' + event_id;
    const ack = {event_id,receipt_id,accepted:true,server_revision:revision,
      verification:'EXACT_EXTERNAL_READBACK'};
    const signature = crypto.createHmac('sha256',secret).update(stable(ack)).digest('hex');
    return json(res,200,{...ack,ack_signature:signature});
  } catch {
    return json(res,502,{accepted:false,error:'WORLDLINE_UNAVAILABLE'});
  }
}
