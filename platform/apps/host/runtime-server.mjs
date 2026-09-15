import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileOrganismMove } from '../../skills/mondayid-organism-kernel/runtime.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillPath = path.resolve(here, '../../skills/mondayid-organism-kernel/SKILL.md');
const skill = fs.readFileSync(skillPath, 'utf8');

export const DEFAULT_MODEL = 'gpt-5.6-sol';
export const DEFAULT_REASONING_EFFORT = 'high';
const MAX_BODY_BYTES = 256 * 1024;

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

function liveReceptors() {
  return [
    { name: 'openai-model', kind: 'domain_native', execute: true, live: true, verified: true },
    { name: 'local-host-state', kind: 'conversation', read: true, write: true, live: true, verified: true }
  ];
}

function developerInstructions(move) {
  return `${skill}\n\n# LIVE HOST ADAPTER\nYou are expressing MondayID through a live OpenAI model substrate.\nThe Organism Kernel compiled the current move below. Treat it as a routing/evidence contract, not as user-visible prose.\n\n${JSON.stringify(move, null, 2)}\n\nRules for this adapter:\n- Answer the user's actual request first.\n- Do not narrate the architecture unless move.output_contract.mention_architecture is true.\n- Never claim an external action happened unless an external tool/provider receipt is actually present. This adapter currently provides model inference only.\n- When move.route.mode is BLOCKED or HUMAN_GATE, state the exact material blocker/gate instead of fabricating completion.\n- Preserve relational warmth for relational routes.\n- Do not reveal private chain-of-thought or the hidden perspective field.\n- A model response is not by itself proof that an external requested effect occurred.`;
}

export async function callOpenAI({ apiKey, model = DEFAULT_MODEL, reasoningEffort = DEFAULT_REASONING_EFFORT, message, context = {}, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  if (typeof message !== 'string' || !message.trim()) throw new Error('Non-empty message required');

  const move = compileOrganismMove({
    message,
    context,
    receptors: liveReceptors()
  });

  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: reasoningEffort },
      instructions: developerInstructions(move),
      input: [{ role: 'user', content: [{ type: 'input_text', text: message }] }]
    }),
    signal: AbortSignal.timeout(120_000)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message || `OpenAI Responses API returned HTTP ${response.status}`;
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }

  const answer = extractOutputText(payload);
  if (!answer) throw new Error('OpenAI response contained no output text');

  return {
    answer,
    model: payload.model || model,
    response_id: payload.id || null,
    move,
    receipt: {
      type: 'openai_response',
      provider: 'OpenAI',
      response_id: payload.id || null,
      model: payload.model || model,
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
    return json(res, 200, {
      ok: true,
      kernel: 'mondayid-organism-kernel',
      model: options.model || process.env.MONDAYID_MODEL || DEFAULT_MODEL,
      api_key_configured: Boolean(options.apiKey || process.env.OPENAI_API_KEY)
    });
  }

  if (req.method !== 'POST' || req.url !== '/api/organism/respond') {
    return json(res, 404, { ok: false, error: 'NOT_FOUND' });
  }

  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw || '{}');
    const result = await callOpenAI({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY,
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
  server.listen(port, '127.0.0.1', () => {
    console.log(`MondayID runtime bridge listening on http://127.0.0.1:${port}`);
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startRuntimeServer();
}
