import { DEFAULT_MODEL, resolveGatewayToken } from '../../apps/host/runtime-server.mjs';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('allow', 'GET');
    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: false, error: 'METHOD_NOT_ALLOWED' }));
  }

  const gatewayToken = resolveGatewayToken();
  const gatewayAvailable = Boolean(gatewayToken);
  const directOpenAIAvailable = Boolean(process.env.OPENAI_API_KEY);

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify({
    ok: true,
    kernel: 'mondayid-organism-kernel',
    model: process.env.MONDAYID_MODEL || DEFAULT_MODEL,
    model_transport_available: gatewayAvailable || directOpenAIAvailable,
    preferred_transport: gatewayAvailable ? 'vercel_ai_gateway' : (directOpenAIAvailable ? 'direct_openai' : null),
    vercel_oidc_available: Boolean(gatewayToken && !process.env.AI_GATEWAY_API_KEY),
    runtime: 'vercel-function'
  }));
}
