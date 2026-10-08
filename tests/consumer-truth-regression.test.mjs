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
  let openedChat = null;
  invoke('signalFromComposer', {
    state, $: () => input, uid, now, save: noop, record: noop,
    renderHome: noop, openObject: noop, openChat: chat => { openedChat = chat; }
  });
  assert.equal(state.chats.length, 1);
  const chat = state.chats[0];
  assert.equal(chat.kind, 'chat');
  assert.ok(Array.isArray(chat.messages), 'chat messages initialized');
  assert.equal(chat.messages.length, 1, 'original composer text becomes first chat message');
  assert.equal(chat.messages[0].text, 'Persistent thought');
  assert.equal(openedChat, chat, 'composer opens the conversation, not a signal detail sheet');
  invoke('sendChatMessage', {
    currentObject: chat, state, uid, now, save: noop, record: noop,
    renderChat: noop, renderChats: noop
  }, "'Hello Monday'");
  assert.equal(chat.messages.length, 2);
  assert.equal(chat.messages[1].text, 'Hello Monday');
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

test('unverified Work cannot be manually promoted to Running or Completed', () => {
  const item={id:'work-1',title:'Work · Task',chatID:'chat-1',state:'Waiting'};
  const log=[];
  const env={record:(...args)=>log.push(args),now:()=> '2026-10-08T12:38:00.000Z',save(){}};
  const src=functionSource('transitionTaskState');
  for(const next of ['Running','Completed','Changed','Failed']){
    const value=vm.runInNewContext(`${src}\ntransitionTaskState(item,${JSON.stringify(next)});`,{...env,item});
    assert.equal(value,false);
    assert.equal(item.state,'Waiting');
  }
  assert.equal(vm.runInNewContext(`${src}\ntransitionTaskState(item,'Needs you');`,{...env,item}),true);
  assert.equal(item.state,'Needs you');
  assert.equal(log.filter(x=>x[0]==='Work transition rejected').length,4);
});
