import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest',import.meta.url),'utf8'));

test('monday is the user-facing product and MondayID is the product owner',()=>{
  assert.match(index,/<title>monday<\/title>/i);
  assert.match(index,/data-product=["']monday["']/i);
  assert.match(index,/MondayID/);
  assert.doesNotMatch(index,/>\s*ChatGPT\s*</i);
  assert.doesNotMatch(index,/>\s*OpenAI\s*</i);
  assert.equal(manifest.name,'monday');
  assert.equal(manifest.short_name,'monday');
});

test('monday exposes a complete iPhone-first chat shell',()=>{
  assert.match(index,/id=["']sidebar["']/);
  assert.match(index,/id=["']newChatButton["']/);
  assert.match(index,/id=["']chatHistory["']/);
  assert.match(index,/id=["']messageList["']/);
  assert.match(index,/id=["']composerForm["']/);
  assert.match(index,/id=["']composerInput["']/);
  assert.match(index,/id=["']attachButton["']/);
  assert.match(index,/id=["']voiceButton["']/);
  assert.match(index,/id=["']sendButton["']/);
  assert.match(index,/id=["']runtimeButton["'][^>]*aria-label=["']MondayID runtime status["']/);
  assert.match(index,/env\(safe-area-inset-bottom\)/);
  assert.match(index,/100dvh|100svh/);
});

test('monday keeps live MondayID runtime readback and never fabricates model replies',()=>{
  assert.match(index,/\/api\/health/);
  assert.match(index,/\/api\/mcp/);
  assert.match(index,/cell_attach/);
  assert.match(index,/capability_manifest/);
  assert.match(index,/cache:\s*['"]no-store['"]/);
  assert.match(index,/data-runtime-state/);
  assert.doesNotMatch(index,/fake assistant|random reply|demo response/i);
});

test('monday remains installable as a standalone mobile surface',()=>{
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'/');
  assert.equal(manifest.scope,'/');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length>0);
});
