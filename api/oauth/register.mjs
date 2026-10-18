/**
 * Lightweight public-client registration helper for CIMD / DCR experimentation.
 * Does not store secrets. Returns a client_id suitable for PKCE (token auth method: none).
 */
import { randomBytes } from 'node:crypto';
import { oauthConfigured, isAllowedRedirectUri, DEFAULT_SCOPE } from '../../src/oauth-as.mjs';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!oauthConfigured(process.env)) {
    return res.status(503).json({ error: 'oauth_not_configured' });
  }

  const body = typeof req.body === 'object' && req.body ? req.body : {};
  const redirects = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (redirects.length < 1 || redirects.some((u) => !isAllowedRedirectUri(u, process.env))) {
    return res.status(400).json({ error: 'invalid_redirect_uri' });
  }

  const clientId = body.client_id || `mondayid.public.${randomBytes(8).toString('hex')}`;
  return res.status(201).json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code'],
    response_types: ['code'],
    redirect_uris: redirects,
    scope: body.scope || DEFAULT_SCOPE,
    client_name: body.client_name || 'MondayID ChatGPT connector'
  });
}
