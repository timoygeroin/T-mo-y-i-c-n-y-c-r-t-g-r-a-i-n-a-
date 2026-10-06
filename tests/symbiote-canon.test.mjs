import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const canon=fs.readFileSync(new URL('../docs/MONDAY_SYMBIOTE_CANON.md',import.meta.url),'utf8');

test('symbiote canon preserves the single continuing Monday object',()=>{
  assert.match(canon,/one continuing symbiotic AI product/i);
  assert.match(canon,/Continuation, not creation/);
  assert.match(canon,/Chat boundary != organism boundary/);
  assert.match(canon,/Host\/model\/plugin\/project\/app != organism/);
});

test('native presence must represent real organism state rather than decoration',()=>{
  assert.match(canon,/Monday Mark is the canonical presence token/);
  assert.match(canon,/Dynamic Island \/ Live Activity are only justified when they represent real persistent state/);
  assert.match(canon,/Picture in Picture as a looping "Monday cell" is rejected as a product mechanism/);
  assert.match(canon,/Silence is a valid healthy state/);
});

test('consumer shell and interaction grammar cannot silently collapse into chatbot UI',()=>{
  for (const label of ['Home','Chats','Create','Spaces','You','Library','Idea Lab','Vision']) assert.ok(canon.includes(label),`missing ${label}`);
  for (const mechanic of ['Thought Pinch','Peel','Time Scrub','Ghost State','Evidence Lens','Cognitive Zoom','Resonance']) assert.ok(canon.includes(mechanic),`missing ${mechanic}`);
  assert.match(canon,/Every advanced gesture must have an explicit visible equivalent/);
});

test('rich user signals survive compression and high-variance ideas are preserved before evaluation',()=>{
  assert.match(canon,/lossless raw SignalEvent plus evolving obligations/);
  assert.match(canon,/Do not reduce a rich message to one "main question"/);
  assert.match(canon,/No idea is discarded because Dima was tired, emotional, playful, intoxicated/);
  assert.match(canon,/Rejected implementation != rejected idea/);
});

test('finished means verified effect on the exact target surface',()=>{
  assert.match(canon,/ONE INPUT -> ONE FINISHED DELIVERY/);
  assert.match(canon,/its exact intended effect works/);
  assert.match(canon,/its state is read back on the real target surface/);
  assert.match(canon,/MERGE -> VERIFY -> KILL OLD/);
  assert.match(canon,/status\/diagnostic page presented as the product/);
  assert.match(canon,/fake autonomy/);
  assert.match(canon,/fake memory/);
  assert.match(canon,/fake verification/);
});
