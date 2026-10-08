import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const js = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function functionSource(name) {
  const begin = js.indexOf(`function ${name}(`);
  assert.ok(begin >= 0, `${name} exists`);
  const brace = js.indexOf('{', begin);
  let depth = 0;
  for (let i = brace; i < js.length; i++) {
    if (js[i] === '{') depth++;
    if (js[i] === '}' && --depth === 0) return js.slice(begin, i + 1);
  }
  throw new Error(`Could not extract ${name}`);
}
function invoke(name, env, args = '') {
  vm.runInNewContext(`${functionSource(name)}\n${name}(${args});`, env);
}

test('composer-created chat can accept a message without an intermediate UI repair', () => {
  const state = { chats: [], signals: [] };
  const input = { value: 'Persistent thought' };
  let i = 0;
  const uid = () => `id-${++i}`;
  const now = () => '2026-10-08T00:00:00.000Z';
  const noop = () => {};
  invoke('signalFromComposer', {
    state, $: () => input, uid, now, save: noop, record: noop,
    renderHome: noop, openObject: noop
  });
  assert.equal(state.chats.length, 1);
  const chat = state.chats[0];
  assert.equal(chat.kind, 'chat');
  assert.ok(Array.isArray(chat.messages), 'chat messages initialized');
  invoke('sendChatMessage', {
    currentObject: chat, state, uid, now, save: noop, record: noop,
    renderChat: noop, renderChats: noop
  }, "'Hello Monday'");
  assert.equal(chat.messages.length, 1);
  assert.equal(chat.messages[0].text, 'Hello Monday');
});

test('Work without an executor is Waiting, never falsely Running', () => {
  const chat = { id: 'chat-1', kind: 'chat', title: 'Task', messages: [] };
  const state = { tasks: [] };
  invoke('startChatWork', {
    currentObject: chat, state, uid: () => 'task-1',
    now: () => '2026-10-08T00:00:00.000Z',
    save() {}, record() {}, renderChat() {}, renderHome() {}
  });
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].state, 'Waiting');
  assert.match(chat.messages[0].text, /waiting/i);
  assert.match(chat.messages[0].text, /no execution has started/i);
});
