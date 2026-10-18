import { exchangeAuthorizationCode, oauthConfigured } from '../../src/oauth-as.mjs';

function readBody(req) {
  if (typeof req.body === 'string' && req.body.length) {
    try {
      return Object.fromEntries(new URLSearchParams(req.body));
    } catch {
      return {};
    }
  }
  if (req.body && typeof req.body === 'object') return req.body;
  return {};
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!oauthConfigured(process.env)) {
    return res.status(503).json({
      error: 'oauth_not_configured',
      error_description: 'Set MONDAYID_OAUTH_ISSUER_SECRET (>=32 chars) on the host.'
    });
  }

  const body = readBody(req);
  if (body.grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }

  const result = exchangeAuthorizationCode({
    env: process.env,
    code: body.code,
    clientId: body.client_id,
    redirectUri: body.redirect_uri,
    codeVerifier: body.code_verifier
  });

  if (!result.ok) {
    return res.status(400).json({
      error: result.error,
      error_description: result.error_description
    });
  }

  return res.status(200).json(result.token);
}
