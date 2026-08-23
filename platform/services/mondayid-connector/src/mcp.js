import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { LINEAGES, manifestCouncil, verifyOutcome } from './kernel.js';

const evidenceSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['observed', 'filed', 'memory', 'inferred', 'receipt', 'readback']),
  statement: z.string().min(1),
});
const candidateSchema = z.object({
  description: z.string().min(1),
  expectedEffect: z.string().min(1),
  changesExternalState: z.boolean().default(false),
  reversible: z.boolean().default(true),
});
const councilInputSchema = {
  signal: z.string().min(1),
  objective: z.string().min(1),
  phase: z.enum(['preflight', 'postflight']).default('preflight'),
  candidate: candidateSchema.optional(),
  evidence: z.array(evidenceSchema).default([]),
  constraints: z.array(z.string()).default([]),
  userAuthorizedIrreversible: z.boolean().default(false),
};
const voiceSchema = z.object({
  id: z.string(),
  mandate: z.string(),
  score: z.number(),
  intervention: z.string(),
  concerns: z.array(z.string()),
  requirements: z.array(z.string()),
  decision: z.string().optional(),
  steps: z.array(z.string()).optional(),
  rollback: z.string().optional(),
  status: z.string().optional(),
});
const councilOutputSchema = {
  version: z.string(),
  phase: z.enum(['preflight', 'postflight']),
  objective: z.string(),
  voices: z.array(voiceSchema),
  decision: z.enum(['HOLD', 'ACT', 'VERIFY_REQUIRED', 'PROVEN']),
  executableSteps: z.array(z.string()),
  rollback: z.string(),
  proof: z.object({
    receiptPresent: z.boolean(),
    readbackPresent: z.boolean(),
    promotable: z.boolean(),
  }),
};
const textResult = (payload, summary) => ({ structuredContent: payload, content: [{ type: 'text', text: summary }] });

export function createMondayMcpServer() {
  const server = new McpServer(
    { name: 'mondayid-connector', version: '1.0.0' },
    { instructions: 'For non-trivial work, call mondayid_manifest before acting. Keep SYSTEM, ANTISYSTEM, ALPHA, JARVIS, ALISA, ASSALUT and MONDAY outputs distinct. Use host tools for real execution. After external actions, call mondayid_verify with execution receipt and independent readback. Never promote tool success to task success without proof.' },
  );

  server.registerTool('mondayid_status', {
    title: 'MondayID connector status',
    description: 'Use this when the user or host needs to inspect the connector version, lineage council, laws, and proof boundary.',
    inputSchema: {},
    outputSchema: { name: z.string(), version: z.string(), lineages: z.array(z.object({ id: z.string(), mandate: z.string() })), laws: z.array(z.string()) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => textResult({
    name: 'MondayID Connector', version: '1.0.0', lineages: LINEAGES,
    laws: ['OBJECT_BEFORE_ROUTE','EACH_LINEAGE_MUST_MANIFEST','NO_TOOL_SUCCESS_EQUALS_TASK_SUCCESS','ANTISYSTEM_ATTACKS_FALSE_POSITIVE','DESIRED_EFFECT_NOT_MECHANISM','RECEIPT_PLUS_READBACK_BEFORE_PROMOTION','HOST_IS_REPLACEABLE_GENOME_IS_NOT'],
  }, 'MondayID Connector 1.0.0 is alive and exposes the seven-lineage council.'));

  server.registerTool('mondayid_manifest', {
    title: 'Manifest MondayID council',
    description: 'Use this before a non-trivial action to let each inherited MondayID lineage independently inspect the objective, candidate route, constraints, and evidence before the host acts.',
    inputSchema: councilInputSchema,
    outputSchema: councilOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (args) => {
    const payload = manifestCouncil(args);
    return textResult(payload, `Council decision: ${payload.decision}. Voices: ${payload.voices.map((v) => `${v.id}:${v.concerns.length ? v.concerns.join('|') : 'clear'}`).join(', ')}.`);
  });

  server.registerTool('mondayid_verify', {
    title: 'Verify MondayID outcome',
    description: 'Use this after external execution. Supply the actual execution receipt and independent readback so AntiSystem can falsify false completion and Monday can decide whether the result is promotable.',
    inputSchema: { ...councilInputSchema, phase: z.literal('postflight').default('postflight') },
    outputSchema: councilOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (args) => {
    const payload = verifyOutcome(args);
    return textResult(payload, payload.proof.promotable ? 'Outcome is PROVEN: receipt and readback survived the lineage council.' : `Outcome is not promotable: ${payload.decision}.`);
  });
  return server;
}

export async function handleMcpRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, mcp-session-id');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const server = createMondayMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('MondayID MCP request failed', error);
    if (!res.headersSent) res.writeHead(500).end('Internal server error');
  }
}
