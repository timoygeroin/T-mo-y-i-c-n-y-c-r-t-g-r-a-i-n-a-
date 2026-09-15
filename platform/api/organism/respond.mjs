import { callOpenAI, DEFAULT_MODEL, DEFAULT_REASONING_EFFORT } from '../../apps/host/runtime-server.mjs';

const MAX_BODY_BYTES = 256 * 1024;

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

function bodyBytes(body) {
  try { return Buffer.byteLength(JSON.stringify(body ?? {})); }
  catch { return MAX_BODY_BYTES + 1; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return send(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    if (bodyBytes(req.body) > MAX_BODY_BYTES) return send(res, 413, { ok: false, error: 'Request body too large' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await callOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.MONDAYID_MODEL || DEFAULT_MODEL,
      reasoningEffort: process.env.MONDAYID_REASONING || DEFAULT_REASONING_EFFORT,
      message: body.message,
      context: body.context || {}
    });
    return send(res, 200, { ok: true, ...result });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return send(res, status, { ok: false, error: error?.message || 'RUNTIME_ERROR' });
  }
}
