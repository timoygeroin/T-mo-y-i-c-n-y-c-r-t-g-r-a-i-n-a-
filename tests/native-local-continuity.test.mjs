import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const native=fs.readFileSync(new URL('../platform/apple-host/MondayIDHost/MondayIDHostApp.swift',import.meta.url),'utf8');

test('native Monday keeps user-pinned memory across chat boundaries',()=>{
  assert.match(native,/store\.documents[\s\S]*?\.filter \{ \$0\.isPinned/);
  assert.match(native,/let continuity = "Pinned Library memory/);
  assert.match(native,/store\.chat\.dropLast\(\)\.suffix\(10\)/);
});

test('on-device response is not mislabeled as cloud-synchronized',()=>{
  assert.match(native,/\.withYou, detail: "On-device · local continuity"/);
  assert.doesNotMatch(native,/\.synced, detail: "On-device · no API spend"/);
});

test('absent model does not append a fake Monday response',()=>{
  assert.match(native,/connectionProblem = "No verified reply:/);
  assert.match(native,/store\.addActivity\(title: "Response unavailable"/);
});

test('native Monday speaks replies on user request',()=>{
  assert.match(native,/AVSpeechSynthesizer\(\)/);
  assert.match(native,/Label\("Listen", systemImage: "speaker\.wave\.2"\)/);
  assert.match(native,/spokenReply\.speak\(utterance\)/);
});
