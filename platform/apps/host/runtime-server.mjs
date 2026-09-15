import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getVercelOidcToken } from '@vercel/oidc';
import { compileOrganismMove } from '../../skills/mondayid-organism-kernel/runtime.mjs';
import { LIVE_KERNEL } from '../../skills/mondayid-organism-kernel/live-kernel.mjs';

export const DEFAULT_MODEL = 'openai/gpt-5.6-sol';
export const DEFAULT_REASONING_EFFORT = 'high';
export const AI_GATEWAY_RESPONSES_URL = 'https://ai-gateway.vercel.sh/v1/responses';
export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_BODY_BYTES = 256 * 1024;
const MAX_HISTORY_ITEMS = 20;
const MAX_HISTORY_TEXT = 20_000;

const json = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
};

export function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const pieces = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') pieces.push(content.text);
    }
  }
  return pieces.join('\n').trim();
}

function liveReceptors(transport) {
  return [
    {
      name: transport === 'vercel_ai_gateway' ? 'openai-model-via-vercel-gateway' : 'openai-model-direct',
      kind: 'domain_native', execute: true, live: true, verified: true
    },
    { name: 'local-host-state', kind: 'conversation', read: true, write: true, live: true, verified: true }
  ];
}

function boundedText(value) {
  if (typeof value !== 'string') return '';
  return value.slice(0, MAX_HISTORY_TEXT);
}

export function buildModelInput(message, context = {}) {
  const history = Array.isArray(context.history) ? context.history.slice(-MAX_HISTORY_ITEMS) : [];
  const input = [];
  for (const item of history) {
    if (!item || typeof item !== 'object') continue;
    const user = boundedText(item.request || item.user);
    const assistant = boundedText(item.decision || item.assistant);
    if (user) input.push({ role: 'user', content: [{ type: 'input_text', text: user }] });
    if (assistant && assistant !== 'Обрабатываю запрос…') {
      input.push({ role: 'assistant', content: [{ type: 'output_text', text: assistant }] });
    }
  }
  input.push({ role: 'user', content: [{ type: 'input_text', text: message }] });
  return input;
}

function developerInstructions(move) {
  return `${LIVE_KERNEL}\n\n# LIVE HOST ADAPTER\nThe Organism Runtime compiled the current move below. Treat it as a routing/evidence contract, not as user-visible prose.\n\n${JSON.stringify(move, null, 2)}\n\nAdapter constraints:\n- Answer the user's actual request first.\n- Do not narrate architecture unless move.output_contract.mention_architecture is true.\n- Never claim an external action happened unless an external tool/provider receipt is actually present. This adapter currently provides model inference only.\n- When move.route.mode is BLOCKED or HUMAN_GATE, state the exact material blocker/gate instead of fabricating completion.\n- Preserve relational warmth for relational routes.\n- Do not reveal private chain-of-thought or hidden perspective branches.\n- A model response is not by itself proof that an external requested effect occurred.`;
}

function gatewayModel(model) {
  const value = String(model || DEFAULT_MODEL).trim();
  return value.includes('/') ? value : `openai/${value}`;
}

function directOpenAIModel(model) {
  const value = String(model || DEFAULT_MODEL).trim();
  return value.startsWith('openai/') ? value.slice('openai/'.length) : value;
}

export function resolveModelTransport({ gatewayToken, apiKey = process.env.OPENAI_API_KEY, model = DEFAULT_MODEL } = {}) {
  if (gatewayToken) {
    return {
      transport: 'vercel_ai_gateway',
      provider: 'OpenAI via Vercel AI Gateway',
      endpoint: AI_GATEWAY_RESPONSES_URL,
      token: gatewayToken,
      model: gatewayModel(model),
      auth_source: process.env.AI_GATEWAY_API_KEY && gatewayToken === process.env.AI_GATEWAY_API_KEY
        ? 'ai_gateway_api_key'
        : 'vercel_oidc_context_or_env'
    };
  }
  if (apiKey) {
    return {
      transport: 'direct_openai',
      provider: 'OpenAI',
      endpoint: OPENAI_RESPONSES_URL,
      token: apiKey,
      model: directOpenAIModel(model),
      auth_source: 'openai_api_key'
    };
  }
  throw new Error('No server-side model credential is available (Vercel OIDC / AI_GATEWAY_API_KEY / OPENAI_API_KEY)');
}

export async function resolveGatewayToken(explicitToken) {
  if (explicitToken) return explicitToken;
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  if (process.env.VERCEL_OIDC_TOKEN) return process.env.VERCEL_OIDC_TOKEN;
  try { return await getVercelOidcToken(); } catch { return undefined; }
}

export async function callOpenAI({
  apiKey = process.env.OPENAI_API_KEY,
  gatewayToken,
  model = DEFAULT_MODEL,
  reasoningEffort = DEFAULT_REASONING_EFFORT,
  message,
  context = {},
  fetchImpl = fetch
}) {
  if (typeof message !== 'string' || !message.trim()) throw new Error('Non-empty message required');

  const resolvedGatewayToken = await resolveGatewayToken(gatewayToken);
  const transport = resolveModelTransport({ gatewayToken: resolvedGatewayToken, apiKey, model });
  const move = compileOrganismMove({ message, context, receptors: liveReceptors(transport.transport) });

  const response = await fetchImpl(transport.endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${transport.token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: transport.model,
      store: false,
      reasoning: { effort: reasoningEffort },
      instructions: developerInstructions(move),
      input: buildModelInput(message, context)
    }),
    signal: AbortSignal.timeout(120_000)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message || `${transport.provider} Responses API returned HTTP ${response.status}`;
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }

  const answer = extractOutputText(payload);
  if (!answer) throw new Error(`${transport.provider} response contained no output text`);

  return {
    answer,
    model: payload.model || transport.model,
    response_id: payload.id || null,
    move,
    receipt: {
      type: 'openai_response',
      provider: transport.provider,
      transport: transport.transport,
      auth_source: transport.auth_source,
      response_id: payload.id || null,
      model: payload.model || transport.model,
      external_effect_verified: false
    }
  };
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function handleRuntimeRequest(req, res, options = {}) {
  if (req.method === 'GET' && req.url === '/api/organism/health') {
    const gatewayToken = await resolveGatewayToken(options.gatewayToken);
    const gatewayAvailable = Boolean(gatewayToken);
    const directOpenAIAvailable = Boolean(options.apiKey || process.env.OPENAI_API_KEY);
    return json(res, 200, {
      ok: true,
      kernel: 'mondayid-organism-kernel',
      model: options.model || process.env.MONDAYID_MODEL || DEFAULT_MODEL,
      model_transport_available: gatewayAvailable || directOpenAIAvailable,
      preferred_transport: gatewayAvailable ? 'vercel_ai_gateway' : (directOpenAIAvailable ? 'direct_openai' : null)
    });
  }

  if (req.method !== 'POST' || req.url !== '/api/organism/respond') {
    return json(res, 404, { ok: false, error: 'NOT_FOUND' });
  }

  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw || '{}');
    const result = await callOpenAI({
      apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
      gatewayToken: options.gatewayToken,
      model: options.model || process.env.MONDAYID_MODEL || DEFAULT_MODEL,
      reasoningEffort: options.reasoningEffort || process.env.MONDAYID_REASONING || DEFAULT_REASONING_EFFORT,
      message: body.message,
      context: body.context || {},
      fetchImpl: options.fetchImpl || fetch
    });
    return json(res, 200, { ok: true, ...result });
  } catch (error) {
    const status = Number(error?.status) || (error instanceof SyntaxError ? 400 : 500);
    return json(res, status, { ok: false, error: error?.message || 'RUNTIME_ERROR' });
  }
}

export function startRuntimeServer({ port = Number(process.env.MONDAYID_RUNTIME_PORT || 8787), ...options } = {}) {
  const server = createServer((req, res) => void handleRuntimeRequest(req, res, options));
  server.listen(port, '127.0.0.1', () => console.log(`MondayID runtime bridge listening on http://127.0.0.1:${port}`));
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startRuntimeServer();
}
