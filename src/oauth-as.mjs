import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Minimal OAuth 2.1 authorization-server scaffold for the existing Monday Work MCP
 * resource (https://mondayid-host.vercel.app/api/mcp). Stateless HMAC codes/tokens —
 * no second MCP host, no client_secret required for public PKCE clients (CIMD/none).
 *
 * Owner gate: endpoints that mint codes/tokens require MONDAYID_OAUTH_ISSUER_SECRET.
 * Production should prefer an external IdP listed in authorization_servers when available.
 */

export const MCP_RESOURCE_PATH = '/api/mcp';
export const DEFAULT_SCOPE = 'mondayid.mcp';
export const OAUTH_PRINCIPAL = 'chatgpt-monday';
export const ACCESS_TOKEN_TTL_SEC = 3600;
export const AUTH_CODE_TTL_SEC = 300;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function requireIssuerSecret(env) {
  const secret = env?.MONDAYID_OAUTH_ISSUER_SECRET;
  if (typeof secret !== 'string' || secret.length < 32) return null;
  return secret;
}

export function publicOrigin(env = process.env, req = null) {
  const fromEnv = env?.MONDAYID_PUBLIC_ORIGIN || env?.VERCEL_PROJECT_PRODUCTION_URL;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) {
    return fromEnv.startsWith('http') ? fromEnv.replace(/\/$/, '') : `https://${fromEnv.replace(/\/$/, '')}`;
  }
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  const proto = req?.headers?.['x-forwarded-proto'] || 'https';
  if (typeof host === 'string' && host.length > 0) return `${proto}://${host}`.replace(/\/$/, '');
  return 'https://mondayid-host.vercel.app';
}

export function protectedResourceMetadata(env = process.env, req = null) {
  const origin = publicOrigin(env, req);
  return {
    resource: `${origin}${MCP_RESOURCE_PATH}`,
    authorization_servers: [origin],
    scopes_supported: [DEFAULT_SCOPE],
    bearer_methods_supported: ['header'],
    resource_documentation: `${origin}/api/status`
  };
}

export function authorizationServerMetadata(env = process.env, req = null) {
  const origin = publicOrigin(env, req);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [DEFAULT_SCOPE],
    client_id_metadata_document_supported: true,
    service_documentation: 'https://docs.google.com/document/d/1GcFdsy_knw4l-xqh5uqLW3Mxi4fOONXr-fYqwfGa_UA/edit'
  };
}

function sign(secret, payloadObj) {
  const payload = b64url(JSON.stringify(payloadObj));
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verify(secret, token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const i = token.lastIndexOf('.');
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!obj || typeof obj !== 'object') return null;
    if (typeof obj.exp === 'number' && Date.now() / 1000 > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}

export function s256Challenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function isAllowedRedirectUri(uri, env = process.env) {
  if (typeof uri !== 'string' || uri.length < 8 || uri.length > 2048) return false;
  let allow = [];
  try {
    const parsed = JSON.parse(env?.MONDAYID_OAUTH_REDIRECT_ALLOWLIST || '[]');
    if (Array.isArray(parsed)) allow = parsed.filter((x) => typeof x === 'string');
  } catch {
    allow = [];
  }
  // ChatGPT / OpenAI connector redirects commonly used in custom MCP OAuth.
  const defaults = [
    'https://chatgpt.com/connector/oauth/',
    'https://chat.openai.com/connector/oauth/',
    'http://127.0.0.1/',
    'http://localhost/'
  ];
  const list = allow.length > 0 ? allow : defaults;
  return list.some((prefix) => uri === prefix || uri.startsWith(prefix));
}

export function mintAuthorizationCode({
  env = process.env,
  clientId,
  redirectUri,
  codeChallenge,
  codeChallengeMethod = 'S256',
  scope = DEFAULT_SCOPE,
  state = null
}) {
  const secret = requireIssuerSecret(env);
  if (!secret) return { ok: false, error: 'oauth_not_configured' };
  if (typeof clientId !== 'string' || clientId.length < 1 || clientId.length > 256) {
    return { ok: false, error: 'invalid_client' };
  }
  if (!isAllowedRedirectUri(redirectUri, env)) return { ok: false, error: 'invalid_redirect_uri' };
  if (codeChallengeMethod !== 'S256') return { ok: false, error: 'invalid_request', error_description: 'S256 required' };
  if (typeof codeChallenge !== 'string' || codeChallenge.length < 43 || codeChallenge.length > 128) {
    return { ok: false, error: 'invalid_request', error_description: 'code_challenge required' };
  }
  const now = Math.floor(Date.now() / 1000);
  const code = sign(secret, {
    typ: 'auth_code',
    jti: randomBytes(16).toString('hex'),
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    scope,
    principal: OAUTH_PRINCIPAL,
    iat: now,
    exp: now + AUTH_CODE_TTL_SEC,
    state: state ?? undefined
  });
  return { ok: true, code, expires_in: AUTH_CODE_TTL_SEC };
}

export function exchangeAuthorizationCode({
  env = process.env,
  code,
  clientId,
  redirectUri,
  codeVerifier
}) {
  const secret = requireIssuerSecret(env);
  if (!secret) return { ok: false, error: 'oauth_not_configured' };
  if (typeof codeVerifier !== 'string' || codeVerifier.length < 43 || codeVerifier.length > 128) {
    return { ok: false, error: 'invalid_grant', error_description: 'code_verifier required' };
  }
  const claims = verify(secret, code);
  if (!claims || claims.typ !== 'auth_code') return { ok: false, error: 'invalid_grant' };
  if (claims.client_id !== clientId) return { ok: false, error: 'invalid_grant' };
  if (claims.redirect_uri !== redirectUri) return { ok: false, error: 'invalid_grant' };
  const expected = s256Challenge(codeVerifier);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(claims.code_challenge || ''));
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: 'invalid_grant', error_description: 'pkce_mismatch' };
  }
  const now = Math.floor(Date.now() / 1000);
  const accessToken = sign(secret, {
    typ: 'access',
    jti: randomBytes(16).toString('hex'),
    client_id: clientId,
    scope: claims.scope || DEFAULT_SCOPE,
    principal: claims.principal || OAUTH_PRINCIPAL,
    aud: `${publicOrigin(env)}${MCP_RESOURCE_PATH}`,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SEC
  });
  return {
    ok: true,
    token: {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SEC,
      scope: claims.scope || DEFAULT_SCOPE
    }
  };
}

/** Verify a bearer that was minted by this AS; returns principal claims or null. */
export function verifyAccessToken(token, env = process.env) {
  const secret = requireIssuerSecret(env);
  if (!secret) return null;
  const claims = verify(secret, token);
  if (!claims || claims.typ !== 'access') return null;
  if (claims.principal !== OAUTH_PRINCIPAL) return null;
  return {
    principal: OAUTH_PRINCIPAL,
    hostBound: true,
    auth: 'oauth',
    scope: claims.scope || DEFAULT_SCOPE,
    clientId: claims.client_id || null
  };
}

export function oauthConfigured(env = process.env) {
  return requireIssuerSecret(env) !== null;
}
