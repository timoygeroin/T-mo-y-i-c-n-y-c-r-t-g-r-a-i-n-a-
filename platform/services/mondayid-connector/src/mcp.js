import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { LINEAGES, manifestCouncil, verifyOutcome } from './kernel.js';
import { DIMA_TWIN_LAWS, decideDimaTwin } from './dima-twin.js';

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

const dimaEvidenceSchema = z.object({
  id: z.string().min(1),
  tier: z.enum(['direct_current_instruction','dima_authored_archive','raw_archive_residue','direct_archive','archive_derived','memory','model_summary']),
  stance: z.enum(['prefer','avoid','authorize','forbid','context']),
  statement: z.string().min(1),
  target: z.string().default(''),
});
const dimaInputSchema = {
  signal: z.string().min(1),
  objective: z.string().min(1),
  candidate: candidateSchema.optional(),
  dimaEvidence: z.array(dimaEvidenceSchema).default([]),
};
const dimaOutputSchema = {
  identity: z.literal('DIMA_TWIN'),
  decision: z.enum(['APPROVE','REJECT','ABSTAIN']),
  confidence: z.number(),
  basis: z.array(z.string()),
  blockers: z.array(z.string()),
  delegation: z.object({ mayAdvise: z.boolean(), mayActAsUser: z.boolean(), mayAuthorizeIrreversible: z.boolean() }),
  laws: z.array(z.string()),
};
const dimaCouncilOutputSchema = {
  dima: z.object(dimaOutputSchema),
  decision: z.enum(['HOLD','ACT','VERIFY_REQUIRED','PROVEN']),
  council: z.object(councilOutputSchema).nullable(),
};

const textResult = (payload, summary) => ({ structuredContent: payload, content: [{ type: 'text', text: summary }] });

export function createMondayMcpServer() {
  const server = new McpServer(
    { name: 'mondayid-connector', version: '1.1.0' },
    { instructions: 'For non-trivial work, call mondayid_manifest before acting. If the task depends on Dima preferences, boundaries, likely choice, or delegated authority, call dima_twin_decide first or use mondayid_dima_manifest. Treat direct current Dima instruction as stronger than archive-derived memory. Never invent a Dima preference: ABSTAIN means ask or preserve the unresolved gate. Never use DIMA Twin to impersonate the user or bypass a human/account/platform gate. Keep SYSTEM, ANTISYSTEM, ALPHA, JARVIS, ALISA, ASSALUT and MONDAY outputs distinct. Use host tools for real execution. After external actions, call mondayid_verify with execution receipt and independent readback. Never promote tool success to task success without proof.' },
  );

  server.registerTool('mondayid_status', {
    title: 'MondayID connector status',
    description: 'Use this when the user or host needs to inspect the connector version, lineage council, laws, and proof boundary.',
    inputSchema: {},
    outputSchema: { name: z.string(), version: z.string(), lineages: z.array(z.object({ id: z.string(), mandate: z.string() })), laws: z.array(z.string()) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => textResult({
    name: 'MondayID Connector', version: '1.1.0', lineages: LINEAGES,
    laws: ['OBJECT_BEFORE_ROUTE','EACH_LINEAGE_MUST_MANIFEST','NO_TOOL_SUCCESS_EQUALS_TASK_SUCCESS','ANTISYSTEM_ATTACKS_FALSE_POSITIVE','DESIRED_EFFECT_NOT_MECHANISM','RECEIPT_PLUS_READBACK_BEFORE_PROMOTION','HOST_IS_REPLACEABLE_GENOME_IS_NOT','DIMA_AUTHORITY_UPSTREAM_OF_ROUTE'],
  }, 'MondayID Connector 1.1.0 is alive with the seven-lineage council and DIMA Twin authority organ.'));

  server.registerTool('dima_twin_status', {
    title: 'DIMA Twin status',
    description: 'Inspect the virtual Dima authority model and its non-impersonation / abstention laws.',
    inputSchema: {},
    outputSchema: { identity: z.literal('DIMA_TWIN'), version: z.string(), laws: z.array(z.string()) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => textResult({ identity: 'DIMA_TWIN', version: '1.0.0', laws: DIMA_TWIN_LAWS }, 'DIMA Twin is available as a source-ranked authority organ.'));

  server.registerTool('dima_twin_decide', {
    title: 'Ask DIMA Twin',
    description: 'Use when a route depends on Dima preferences, boundaries, or likely choice. Supply source-ranked Dima evidence. The twin can approve, reject, or abstain; it never invents missing preferences and never impersonates the user.',
    inputSchema: dimaInputSchema,
    outputSchema: dimaOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (args) => {
    const payload = decideDimaTwin({ signal: args.signal, objective: args.objective, candidate: args.candidate, evidence: args.dimaEvidence });
    return textResult(payload, `DIMA Twin decision: ${payload.decision}${payload.blockers.length ? ` (${payload.blockers.join(', ')})` : ''}.`);
  });

  server.registerTool('mondayid_dima_manifest', {
    title: 'Manifest MondayID through DIMA Twin',
    description: 'Use for consequential work that depends on Dima authority. DIMA Twin evaluates source-ranked user evidence first. REJECT or ABSTAIN hard-stops the route; APPROVE allows the seven-lineage MondayID preflight to run.',
    inputSchema: { ...councilInputSchema, dimaEvidence: z.array(dimaEvidenceSchema).default([]) },
    outputSchema: dimaCouncilOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (args) => {
    const dima = decideDimaTwin({ signal: args.signal, objective: args.objective, candidate: args.candidate, evidence: args.dimaEvidence });
    if (dima.decision !== 'APPROVE') {
      const payload = { dima, decision: 'HOLD', council: null };
      return textResult(payload, `Route held upstream by DIMA Twin: ${dima.decision}. MondayID council was not allowed to collapse the route.`);
    }
    const council = manifestCouncil(args);
    const payload = { dima, decision: council.decision, council };
    return textResult(payload, `DIMA Twin approved the route; MondayID council decision: ${council.decision}.`);
  });

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
