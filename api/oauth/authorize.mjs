import {
  mintAuthorizationCode,
  oauthConfigured,
  isAllowedRedirectUri,
  authorizationServerMetadata
} from '../../src/oauth-as.mjs';

function htmlEscape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function query(req) {
  const url = new URL(req.url || '/', 'http://localhost');
  // Vercel may put query on req.query
  const q = { ...Object.fromEntries(url.searchParams.entries()), ...(req.query || {}) };
  return q;
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!oauthConfigured(process.env)) {
    return res.status(503).json({
      error: 'oauth_not_configured',
      error_description: 'Set MONDAYID_OAUTH_ISSUER_SECRET (>=32 chars) on the host. Do not paste secrets into chat or Docs.'
    });
  }

  const q = query(req);
  const body = typeof req.body === 'object' && req.body ? req.body : {};
  const params = { ...q, ...body };

  const clientId = params.client_id;
  const redirectUri = params.redirect_uri;
  const responseType = params.response_type || 'code';
  const codeChallenge = params.code_challenge;
  const codeChallengeMethod = params.code_challenge_method || 'S256';
  const scope = params.scope || 'mondayid.mcp';
  const state = params.state || '';

  if (responseType !== 'code') {
    return res.status(400).json({ error: 'unsupported_response_type' });
  }
  if (!isAllowedRedirectUri(redirectUri, process.env)) {
    return res.status(400).json({ error: 'invalid_redirect_uri' });
  }

  const consent = params.consent === '1' || params.consent === 'approve' || req.method === 'POST';
  if (!consent) {
    const meta = authorizationServerMetadata(process.env, req);
    const action = htmlEscape(meta.authorization_endpoint);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"/><title>MondayID OAuth consent</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem;line-height:1.45}
  code{font-size:.9em} button{font:inherit;padding:.6rem 1rem;cursor:pointer}
</style></head><body>
<h1>MondayID MCP</h1>
<p>Public PKCE client <code>${htmlEscape(clientId || '')}</code> requests scope <code>${htmlEscape(scope)}</code> for resource <code>/api/mcp</code>.</p>
<p>Principal after success: <code>chatgpt-monday</code> (host-bound). No spend. Secrets stay on the server.</p>
<form method="POST" action="${action}">
  <input type="hidden" name="response_type" value="code"/>
  <input type="hidden" name="client_id" value="${htmlEscape(clientId || '')}"/>
  <input type="hidden" name="redirect_uri" value="${htmlEscape(redirectUri || '')}"/>
  <input type="hidden" name="code_challenge" value="${htmlEscape(codeChallenge || '')}"/>
  <input type="hidden" name="code_challenge_method" value="${htmlEscape(codeChallengeMethod)}"/>
  <input type="hidden" name="scope" value="${htmlEscape(scope)}"/>
  <input type="hidden" name="state" value="${htmlEscape(state)}"/>
  <input type="hidden" name="consent" value="1"/>
  <button type="submit">Разрешить</button>
</form>
</body></html>`);
  }

  const minted = mintAuthorizationCode({
    env: process.env,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope,
    state: state || null
  });
  if (!minted.ok) {
    return res.status(400).json({ error: minted.error, error_description: minted.error_description });
  }

  const dest = new URL(redirectUri);
  dest.searchParams.set('code', minted.code);
  if (state) dest.searchParams.set('state', state);
  res.statusCode = 302;
  res.setHeader('Location', dest.toString());
  return res.end();
}
