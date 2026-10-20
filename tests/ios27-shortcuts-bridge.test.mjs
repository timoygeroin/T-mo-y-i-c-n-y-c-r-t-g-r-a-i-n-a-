import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=html.match(/<script>([\\s\\S]*?)<\\/script>/)?.[1];

test('shortcuts bridge is valid client JavaScript',()=>{
  assert.ok(script);
  assert.doesNotThrow(()=>new vm.Script(script));
});
test('only a real user button starts an Apple Shortcuts call',()=>{
  assert.match(script,/ask\.addEventListener\\('click',\\(\\)=>askShortcuts\\(thread,input\.value\\)\\)/);
  assert.match(script,/shortcuts:\/\/x-callback-url\/run-shortcut/);
  assert.match(script,/shortcuts:\/\/create-shortcut/);
});
test('callback accepts only matching recent browser-local request',()=>{
  assert.match(script,/pending\.requestId!==params\.get\\('requestId'\\)/);
  assert.match(script,/Date\.now\\(\\)-pending\.createdAt>20\\*60\\*1000/);
  assert.match(script,/localStorage\.removeItem\\(BRIDGE_PENDING\\)/);
  assert.match(script,/result\.length<=12000/);
});
test('error and cancellation cannot fabricate a Monday response',()=>{
  assert.match(script,/state==='ok'&&thread&&result&&result\.trim\\(\\)/);
  assert.match(script,/state==='cancel'\\?'Shortcut canceled'/);
  assert.match(script,/event\\('shortcut_reply'/);
  assert.match(script,/not independently verified model provenance/);
});
test('model is user-selected in native Shortcuts; no paid API key required',()=>{
  assert.match(script,/Apple Intelligence Use Model action/);
  assert.match(script,/On-Device model/);
  assert.match(script,/Finish with Stop and Output/);
  assert.doesNotMatch(script,/OPENAI_API_KEY/);
});
