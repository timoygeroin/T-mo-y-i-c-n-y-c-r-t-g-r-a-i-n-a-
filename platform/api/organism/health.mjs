import { DEFAULT_MODEL } from '../../apps/host/runtime-server.mjs';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('allow', 'GET');
    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }));
  }

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify({
    ok: true,
    kernel: 'mondayid-organism-kernel',
    model: process.env.MONDAYID_MODEL || DEFAULT_MODEL,
    api_key_configured: Boolean(process.env.OPENAI_API_KEY),
    runtime: 'vercel-function'
  }));
}
