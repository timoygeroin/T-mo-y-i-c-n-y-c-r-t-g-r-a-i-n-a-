import { timingSafeEqual } from 'node:crypto';
import { verifyAccessToken } from './oauth-as.mjs';

// Default deny (BUS-REVIEW-03): only explicitly public, non-sensitive tools pass
// without a credential. Any other name, including typos and future tools, is private.
export const PUBLIC_MCP_TOOLS = Object.freeze([
  'health',
  'visual_release_gate',
  'capability_manifest',
  'compile_history'
]);

// Known private tools (documentation + tests); privacy does not depend on this list.
export const PRIVATE_MCP_TOOLS = Object.freeze([
  'cell_attach',
  'amplify_intent',
  'meta_probe',
  'simulate_counterfactual',
  'get_state',
  'prove_trusted_write_readback',
  'bus_post',
  'bus_list',
  'bus_get',
  'bus_ack'
]);

const same = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function bearer(req) {
  const auth = req?.headers?.authorization ?? req?.headers?.Authorization;
  return typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

const HOST_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;

function hostTokenMap(env) {
  try {
    const parsed = JSON.parse(env?.MONDAYID_BUS_HOST_TOKENS || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

// Server-derived principal (BUS-REVIEW-04 + D2 OAuth).
// Order in this stage: per-host static tokens → shared legacy token.
// OAuth will be connected only after separate issuer/consent verification.
// Host names are an allowlist of identifiers; a bad map cannot throw or bind
// a principal the server did not name.
export function resolvePrincipal(req = {}, env = process.env) {
  const supplied = bearer(req);
  if (!supplied) return null;
  for (const [host, token] of Object.entries(hostTokenMap(env))) {
    if (!HOST_NAME.test(host)) continue;
    if (typeof token === 'string' && token.length >= 16 && same(supplied, token)) return { principal:host, hostBound:true };
  }
  const oauth=verifyAccessToken(supplied,env);
  if(oauth) return oauth;
  const shared = env?.MONDAYID_HOST_TOKEN || env?.MONDAYID_WORLDLINE_WRITER_TOKEN;
  if (typeof shared === 'string' && shared.length > 0 && same(supplied, shared)) return { principal:'shared', hostBound:false };
  return null;
}

export function authorizeMcpTool(name, req = {}, env = process.env) {
  if (PUBLIC_MCP_TOOLS.includes(name)) return true;
  const principal=resolvePrincipal(req,env);
  if (name==='bus_post' || name==='bus_ack') return principal?.hostBound===true;
  return principal !== null;
}
