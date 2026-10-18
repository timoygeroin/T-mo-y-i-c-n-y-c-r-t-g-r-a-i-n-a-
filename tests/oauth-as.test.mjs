import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mintAuthorizationCode,
  exchangeAuthorizationCode,
  verifyAccessToken,
  s256Challenge,
  protectedResourceMetadata,
  authorizationServerMetadata,
  oauthConfigured
} from '../src/oauth-as.mjs';
import { authorizeMcpTool, resolvePrincipal } from '../src/mcp-access.mjs';

const SECRET = 'o'.repeat(32);
const envBase = {
  MONDAYID_OAUTH_ISSUER_SECRET: SECRET,
  MONDAYID_PUBLIC_ORIGIN: 'https://mondayid-host.vercel.app'
};

test('oauth metadata points at existing MCP resource (no second host)', () => {
  const prm = protectedResourceMetadata(envBase);
  assert.equal(prm.resource, 'https://mondayid-host.vercel.app/api/mcp');
  assert.deepEqual(prm.authorization_servers, ['https://mondayid-host.vercel.app']);
  const as = authorizationServerMetadata(envBase);
  assert.equal(as.issuer, 'https://mondayid-host.vercel.app');
  assert.deepEqual(as.code_challenge_methods_supported, ['S256']);
  assert.deepEqual(as.token_endpoint_auth_methods_supported, ['none']);
});

test('PKCE authorize→token maps to chatgpt-monday hostBound principal', () => {
  assert.equal(oauthConfigured({}), false);
  const verifier = 'v'.repeat(64);
  const challenge = s256Challenge(verifier);
  const minted = mintAuthorizationCode({
    env: envBase,
    clientId: 'chatgpt-connector',
    redirectUri: 'https://chatgpt.com/connector/oauth/callback',
    codeChallenge: challenge
  });
  assert.equal(minted.ok, true);
  const exchanged = exchangeAuthorizationCode({
    env: envBase,
    code: minted.code,
    clientId: 'chatgpt-connector',
    redirectUri: 'https://chatgpt.com/connector/oauth/callback',
    codeVerifier: verifier
  });
  assert.equal(exchanged.ok, true);
  const principal = verifyAccessToken(exchanged.token.access_token, envBase);
  assert.deepEqual(principal, {
    principal: 'chatgpt-monday',
    hostBound: true,
    auth: 'oauth',
    scope: 'mondayid.mcp',
    clientId: 'chatgpt-connector'
  });
  const resolved = resolvePrincipal(
    { headers: { authorization: `Bearer ${exchanged.token.access_token}` } },
    envBase
  );
  assert.equal(resolved.principal, 'chatgpt-monday');
  assert.equal(resolved.hostBound, true);
  assert.equal(resolved.auth, 'oauth');
  assert.equal(
    authorizeMcpTool('bus_list', { headers: { authorization: `Bearer ${exchanged.token.access_token}` } }, envBase),
    true
  );
});

test('PKCE mismatch and wrong redirect fail closed', () => {
  const verifier = 'a'.repeat(64);
  const minted = mintAuthorizationCode({
    env: envBase,
    clientId: 'c1',
    redirectUri: 'https://chatgpt.com/connector/oauth/',
    codeChallenge: s256Challenge(verifier)
  });
  assert.equal(minted.ok, true);
  assert.equal(
    exchangeAuthorizationCode({
      env: envBase,
      code: minted.code,
      clientId: 'c1',
      redirectUri: 'https://chatgpt.com/connector/oauth/',
      codeVerifier: 'b'.repeat(64)
    }).ok,
    false
  );
  assert.equal(
    mintAuthorizationCode({
      env: envBase,
      clientId: 'c1',
      redirectUri: 'https://evil.example/callback',
      codeChallenge: s256Challenge(verifier)
    }).ok,
    false
  );
});

test('oauth bearer without issuer secret does not open private tools', () => {
  assert.equal(
    authorizeMcpTool('bus_post', { headers: { authorization: 'Bearer anything.signed' } }, {}),
    false
  );
});
