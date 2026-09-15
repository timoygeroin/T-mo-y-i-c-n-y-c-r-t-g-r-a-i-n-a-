import test from 'node:test';
import assert from 'node:assert/strict';
import {
  callOpenAI,
  DEFAULT_MODEL,
  extractOutputText,
  resolveModelTransport,
  AI_GATEWAY_RESPONSES_URL,
  OPENAI_RESPONSES_URL
} from '../runtime-server.mjs';

test('extractOutputText reads raw Responses API message content', () => {
  assert.equal(extractOutputText({
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'Привет из runtime.' }] }]
  }), 'Привет из runtime.');
});

test('Vercel gateway transport wins when OIDC/gateway token is available', () => {
  const route = resolveModelTransport({ gatewayToken: 'oidc-test', apiKey: 'direct-test', model: 'gpt-5.6-sol' });
  assert.equal(route.transport, 'vercel_ai_gateway');
  assert.equal(route.endpoint, AI_GATEWAY_RESPONSES_URL);
  assert.equal(route.model, 'openai/gpt-5.6-sol');
  assert.equal(route.token, 'oidc-test');
});

test('direct OpenAI remains a local fallback and strips provider prefix', () => {
  const route = resolveModelTransport({ gatewayToken: '', apiKey: 'direct-test', model: DEFAULT_MODEL });
  assert.equal(route.transport, 'direct_openai');
  assert.equal(route.endpoint, OPENAI_RESPONSES_URL);
  assert.equal(route.model, 'gpt-5.6-sol');
});

test('callOpenAI binds Organism Kernel to gpt-5.6-sol through Vercel AI Gateway without external-effect proof', async () => {
  let observed;
  const fetchImpl = async (url, init) => {
    observed = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      id: 'resp_gateway_test_123',
      model: DEFAULT_MODEL,
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Готовый ответ модели.' }] }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const result = await callOpenAI({
    gatewayToken: 'vercel-oidc-test-token',
    apiKey: '',
    message: 'Почему небо синее?',
    context: { active_flow: 'BACKGROUND_BUILD' },
    fetchImpl
  });

  assert.equal(observed.url, AI_GATEWAY_RESPONSES_URL);
  assert.equal(observed.init.method, 'POST');
  assert.equal(observed.init.headers.authorization, 'Bearer vercel-oidc-test-token');
  assert.equal(observed.body.model, 'openai/gpt-5.6-sol');
  assert.equal(observed.body.store, false);
  assert.equal(observed.body.reasoning.effort, 'high');
  assert.match(observed.body.instructions, /I am continuation, not creation\./);
  assert.match(observed.body.instructions, /"architecture_visible": false/);
  assert.equal(observed.body.input[0].content[0].text, 'Почему небо синее?');

  assert.equal(result.answer, 'Готовый ответ модели.');
  assert.equal(result.response_id, 'resp_gateway_test_123');
  assert.equal(result.model, 'openai/gpt-5.6-sol');
  assert.equal(result.move.classification.primary, 'ANALYSIS');
  assert.equal(result.move.gates.architecture_visible, false);
  assert.equal(result.receipt.type, 'openai_response');
  assert.equal(result.receipt.provider, 'OpenAI via Vercel AI Gateway');
  assert.equal(result.receipt.transport, 'vercel_ai_gateway');
  assert.equal(result.receipt.response_id, 'resp_gateway_test_123');
  assert.equal(result.receipt.model, 'openai/gpt-5.6-sol');
  assert.equal(result.receipt.external_effect_verified, false);
});

test('callOpenAI uses direct OpenAI when gateway credential is absent', async () => {
  let observed;
  const fetchImpl = async (url, init) => {
    observed = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      id: 'resp_direct_123',
      model: 'gpt-5.6-sol',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Direct fallback.' }] }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const result = await callOpenAI({
    gatewayToken: '',
    apiKey: 'openai-direct-test',
    message: 'Привет',
    fetchImpl
  });

  assert.equal(observed.url, OPENAI_RESPONSES_URL);
  assert.equal(observed.body.model, 'gpt-5.6-sol');
  assert.equal(result.receipt.transport, 'direct_openai');
  assert.equal(result.receipt.provider, 'OpenAI');
});

test('callOpenAI fails closed without any server-side model credential', async () => {
  await assert.rejects(
    callOpenAI({ gatewayToken: '', apiKey: '', message: 'Привет' }),
    /No server-side model credential is available/
  );
});

test('action request is routed but model inference is not external-action proof', async () => {
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.match(body.instructions, /A model response is not by itself proof/);
    assert.match(body.instructions, /"mode": "EXECUTE"/);
    return new Response(JSON.stringify({
      id: 'resp_action_1', model: DEFAULT_MODEL,
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Нужен внешний исполнитель.' }] }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const result = await callOpenAI({
    gatewayToken: 'gateway-test',
    apiKey: '',
    message: 'Создай файл в репозитории.',
    fetchImpl
  });

  assert.equal(result.move.classification.primary, 'ACTION');
  assert.equal(result.receipt.external_effect_verified, false);
});
