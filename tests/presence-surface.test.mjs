import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));

test('Monday is a usable mobile-first consumer surface with stable navigation',()=>{
  assert.match(index,/apple-mobile-web-app-capable/);
  assert.match(index,/manifest\.webmanifest/);
  for (const tab of ['home','chats','create','spaces','you']) {
    assert.match(index,new RegExp('data-tab="'+tab+'"'));
  }
  for(const object of ['Library','Activity','Search','checkpoint','Export my data','Import a backup']){
    assert.ok(index.includes(object),'missing functional consumer path: '+object);
  }
  assert.doesNotMatch(index,/>Generation 5</);
  assert.doesNotMatch(index,/>Kernel</);
});

test('consumer entry does not fetch private Worldline or impersonate model execution',()=>{
  assert.match(index,/\/api\/health/);
  assert.match(index,/\/api\/boot/);
  assert.doesNotMatch(index,/\/api\/mcp/);
  assert.doesNotMatch(index,/get_state/);
  assert.match(index,/does not impersonate an AI assistant/);
  assert.match(index,/Nothing is sent to an AI model here/);
  assert.match(index,/localStorage\.setItem/);
  assert.match(index,/textContent/);
  assert.doesNotMatch(index,/\.innerHTML\s*=/);
  assert.match(index,/aria-live=/);
  for(const state of ['With you','Working','Verifying','Synced']) assert.ok(index.includes(state));
});

test('inline Monday product JavaScript compiles',()=>{
  const scripts=[...index.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  assert.doesNotThrow(()=>new vm.Script(scripts[0][1]));
});

test('Monday remains installable as standalone mobile software',()=>{
  assert.equal(manifest.name,'Monday');
  assert.equal(manifest.short_name,'Monday');
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'/');
  assert.equal(manifest.scope,'/');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length>0);
});
