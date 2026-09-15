import test from 'node:test';
import assert from 'node:assert/strict';
import { callOpenAI, DEFAULT_MODEL, extractOutputText } from '../runtime-server.mjs';

test('extractOutputText reads raw Responses API message content', () => {
  assert.equal(extractOutputText({
    output: [{ type: 'message', content: [{ type: 'output_text', text: 'Привет из runtime.' }] }]
  }), 'Привет из runtime.');
});

test('callOpenAI binds Organism Kernel to gpt-5.6-sol without claiming external effect proof', async () => {
  let observed;
  const fetchImpl = async (url, init) => {
    observed = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      id: 'resp_test_123',
      model: DEFAULT_MODEL,
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Готовый ответ модели.' }] }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const result = await callOpenAI({
    apiKey: 'test-key-never-sent-to-browser',
    message: 'Почему небо синее?',
    context: { active_flow: 'BACKGROUND_BUILD' },
    fetchImpl
  });

  assert.equal(observed.url, 'https://api.openai.com/v1/responses');
  assert.equal(observed.init.method, 'POST');
  assert.equal(observed.init.headers.authorization, 'Bearer test-key-never-sent-to-browser');
  assert.equal(observed.body.model, 'gpt-5.6-sol');
  assert.equal(observed.body.store, false);
  assert.equal(observed.body.reasoning.effort, 'high');
  assert.match(observed.body.instructions, /I am continuation, not creation\./);
  assert.match(observed.body.instructions, /"architecture_visible": false/);
  assert.equal(observed.body.input[0].content[0].text, 'Почему небо синее?');

  assert.equal(result.answer, 'Готовый ответ модели.');
  assert.equal(result.response_id, 'resp_test_123');
  assert.equal(result.model, 'gpt-5.6-sol');
  assert.equal(result.move.classification.primary, 'ANALYSIS');
  assert.equal(result.move.gates.architecture_visible, false);
  assert.deepEqual(result.receipt, {
    type: 'openai_response',
    provider: 'OpenAI',
    response_id: 'resp_test_123',
    model: 'gpt-5.6-sol',
    external_effect_verified: false
  });
});

test('callOpenAI fails closed without a server-side API key', async () => {
  await assert.rejects(
    callOpenAI({ apiKey: '', message: 'Привет' }),
    /OPENAI_API_KEY is not configured/
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
    apiKey: 'test-key',
    message: 'Создай файл в репозитории.',
    fetchImpl
  });

  assert.equal(result.move.classification.primary, 'ACTION');
  assert.equal(result.receipt.external_effect_verified, false);
});
