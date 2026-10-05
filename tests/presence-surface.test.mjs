import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));

test('Monday presence is a mobile identity surface, not the old engineering dashboard',()=>{
  assert.match(index,/apple-mobile-web-app-capable/);
  assert.match(index,/manifest\.webmanifest/);
  assert.match(index,/With you/);
  assert.match(index,/Working/);
  assert.match(index,/Verifying/);
  assert.match(index,/Synced/);
  assert.doesNotMatch(index,/>Generation 5</);
  assert.doesNotMatch(index,/>Kernel</);
});

test('Monday presence derives state from live organism receptors',()=>{
  assert.match(index,/\/api\/health/);
  assert.match(index,/\/api\/mcp/);
  assert.match(index,/capability_manifest/);
  assert.match(index,/\/api\/boot/);
  assert.match(index,/cache:\s*['"]no-store['"]/);
  assert.match(index,/aria-live=/);
});

test('Monday presence can be installed as a standalone mobile surface',()=>{
  assert.equal(manifest.name,'Monday');
  assert.equal(manifest.short_name,'Monday');
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'/');
  assert.equal(manifest.scope,'/');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length>0);
});
