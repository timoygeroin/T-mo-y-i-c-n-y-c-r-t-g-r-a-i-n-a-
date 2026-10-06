import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../app.css',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');

test('consumer root is the Monday product shell, not the rejected status-orb page',()=>{
  for(const label of ['Home','Chats','Create','Spaces','You']) assert.match(html,new RegExp('>'+label+'<'));
  for(const label of ['Library','Idea Lab','Vision','Activity']) assert.match(html,new RegExp(label));
  assert.doesNotMatch(html,/class="orb"/);
  assert.doesNotMatch(html,/Sync reality<\/button>\s*<button[^>]*>Verify runtime/);
});

test('consumer shell reads real Generation-5 runtime state and withholds fake verification',()=>{
  assert.match(js,/fetch\('\/api\/status'/);
  assert.match(js,/fetch\('\/api\/boot'/);
  assert.match(js,/mcpCall\('get_state'/);
  assert.match(js,/Generation-5 readback/);
  assert.match(js,/Readback failed · claim withheld/);
});

test('objects persist locally and expose semantic-depth mechanics without pretending missing history',()=>{
  assert.match(js,/localStorage\.setItem/);
  for(const phrase of ['Peel','Time Scrub','Ghost State']) assert.match(html,new RegExp(phrase));
  assert.match(html,/Surface/);
  assert.match(html,/Relations/);
  assert.match(html,/Evidence/);
  assert.match(js,/Ghost State needs at least two recorded versions/);
});

test('persisted runtime can never reopen as live verified truth and local objects are deletable',()=>{
  assert.match(js,/restored\.runtime\.presence='recovering'/);
  assert.match(js,/restored\.runtime\.live=false/);
  assert.match(js,/Cached prior state · live verification required/);
  assert.match(js,/Offline · cached state is not live verification/);
  assert.match(html,/id="deleteObject"/);
  assert.match(js,/Moved to Trash/);
});

test('semantic objects can evolve relate zoom move and undo instead of remaining decorative cards',()=>{
  assert.match(html,/Edit \/ Move/);
  assert.match(html,/Thought Pinch \/ Cognitive Zoom/);
  assert.match(js,/function resonanceFor/);
  assert.match(js,/shared Space or shared terms/);
  assert.match(js,/currentObject\.versions=/);
  assert.match(js,/data-task-state/);
  assert.match(js,/Moved to Trash/);
  assert.match(js,/Undo Trash/);
  assert.match(js,/touchstart/);
  assert.match(js,/cycleDepth/);
});

test('the web body has an explicit no-cost iPhone installation path',()=>{
  assert.match(js,/Add to Home Screen/);
  assert.match(js,/display-mode: standalone/);
  assert.match(html,/id="installDialog"/);
  assert.match(js,/Dynamic Island \/ Live Activity still require the native iOS body/);
});

test('PWA is installable/offline while API truth remains network-only',()=>{
  assert.match(html,/manifest\.webmanifest/);
  assert.match(js,/serviceWorker\.register/);
  assert.match(sw,/caches\.open/);
  assert.match(sw,/pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw,/fetch\(e\.request\)/);
});

test('visual language remains quiet premium rather than cyberpunk dashboard',()=>{
  assert.match(css,/backdrop-filter:blur/);
  assert.match(css,/safe-area-inset-bottom/);
  assert.doesNotMatch(css,/neon|matrix|hud/i);
  for(const label of ['Library','Idea Lab','Vision']) assert.match(html,new RegExp('>'+label+'<'));
});
