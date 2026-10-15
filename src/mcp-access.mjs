import { timingSafeEqual } from 'node:crypto';

// These tools can reveal or mutate the private cross-host Worldline.
// Public MCP discovery does not grant permission to use private tools.
export const PRIVATE_MCP_TOOLS = Object.freeze([
  'cell_attach',
  'get_state',
  'prove_trusted_write_readback',
  'bus_post',
  'bus_list',
  'bus_get',
  'bus_ack'
]);

export function authorizeMcpTool(name, req = {}, env = process.env) {
  if (!PRIVATE_MCP_TOOLS.includes(name)) return true;
  const secret = env?.MONDAYID_HOST_TOKEN;
  if (typeof secret !== 'string' || secret.length === 0) return false;
  const auth = req?.headers?.authorization ?? req?.headers?.Authorization;
  if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(auth.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
