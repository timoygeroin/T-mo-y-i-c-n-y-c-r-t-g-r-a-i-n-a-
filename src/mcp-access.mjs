import { timingSafeEqual } from 'node:crypto';

// These tools can reveal or mutate the private cross-host Worldline.
// Public MCP discovery does not grant permission to use private tools.
export const PRIVATE_MCP_TOOLS = Object.freeze([
  'cell_attach',
  'get_state',
  'prove_trusted_write_readback'
]);

export function authorizeMcpTool(name, req = {}, env = process.env) {
  if (!PRIVATE_MCP_TOOLS.includes(name)) return true;
  // The writer token is already a higher-authority credential: possession grants
  // direct append access to the same private Worldline. Reusing it as the MCP
  // bearer keeps existing deployments reachable without creating or exposing a
  // second secret. A dedicated host token still takes precedence when present.
  const secret = env?.MONDAYID_HOST_TOKEN || env?.MONDAYID_WORLDLINE_WRITER_TOKEN;
  if (typeof secret !== 'string' || secret.length === 0) return false;
  const auth = req?.headers?.authorization ?? req?.headers?.Authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(auth.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
