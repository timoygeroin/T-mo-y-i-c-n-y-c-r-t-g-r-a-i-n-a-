import { createServer } from 'node:http';
import { handleMcpRequest } from './mcp.js';

const port = Number(process.env.PORT ?? 8787);
const MCP_PATH = '/mcp';

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      ok: true,
      service: 'mondayid-connector',
      version: '1.0.0',
      mcp: MCP_PATH,
      architecture: 'lineage-council+antisystem+receipt-readback',
    }));
    return;
  }
  if (url.pathname === MCP_PATH && ['POST', 'GET', 'DELETE', 'OPTIONS'].includes(req.method ?? '')) {
    await handleMcpRequest(req, res);
    return;
  }
  res.writeHead(404).end('Not Found');
});

httpServer.listen(port, () => console.log(`MondayID Connector listening on http://localhost:${port}${MCP_PATH}`));
