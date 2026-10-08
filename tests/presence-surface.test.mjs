import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));

test('Monday presence is embedded in the consumer product instead of being the product by itself',()=>{
  assert.match(index,/apple-mobile-web-app-capable/);
  assert.match(index,/manifest\.webmanifest/);
  assert.match(index,/id="presenceText"/);
  assert.match(index,/>Home</);
  assert.match(index,/>Chats</);
  assert.match(index,/>Create</);
  assert.match(index,/>Spaces</);
  assert.match(index,/>You</);
  assert.doesNotMatch(index,/class="orb"/);
  assert.doesNotMatch(index,/>Generation 5</);
});

test('Monday presence derives truth state from live organism receptors after the UI split',()=>{
  assert.match(app,/fetch\('\/api\/status'/);
  assert.match(app,/fetch\('\/api\/boot'/);
  assert.match(app,/fetch\('\/api\/mcp'/);
  assert.match(app,/mcpCall\('get_state'/);
  assert.match(app,/cache:'no-store'/);
  assert.match(app,/Readback failed · claim withheld/);
  assert.match(index,/aria-label="Monday state"/);
});

test('Monday presence can be installed as a standalone mobile surface',()=>{
  assert.equal(manifest.name,'Monday');
  assert.equal(manifest.short_name,'Monday');
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'/');
  assert.equal(manifest.scope,'/');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length>0);
});
