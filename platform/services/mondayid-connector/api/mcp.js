import { handleMcpRequest } from '../src/mcp.js';
export default async function handler(req, res) {
  await handleMcpRequest(req, res);
}
