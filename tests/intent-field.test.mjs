import test from 'node:test';
import assert from 'node:assert/strict';
import { MondayRuntime } from '../src/runtime.mjs';

test('unfinished intent survives the turn and resumes without a new human command', async () => {
  let hostRuns = 0;
  let visionRuns = 0;

  const runtime = new MondayRuntime({
    capabilities:{
      host:{
        name:'host',
        execute:async()=>{ hostRuns += 1; return {ok:true}; },
        verify:async result=>({ok:result.ok})
      }
    }
  });

  const first = await runtime.cycle([{id:'whole-system', text:'finish host and vision', priority:90}]);
  assert.equal(first.ok, true);
  assert.equal(hostRuns, 1);
  assert.equal(first.intents['whole-system'].status, 'active');
  assert.deepEqual(first.intents['whole-system'].completedDomains, ['host']);

  runtime.capabilities.vision = {
    name:'vision',
    execute:async()=>{ visionRuns += 1; return {ok:true}; },
    verify:async result=>({ok:result.ok})
  };

  const second = await runtime.cycle([]);
  assert.equal(second.ok, true);
  assert.equal(hostRuns, 1);
  assert.equal(visionRuns, 1);
  assert.equal(second.intents['whole-system'].status, 'fulfilled');
  assert.deepEqual(new Set(second.intents['whole-system'].completedDomains), new Set(['host','vision']));
});

test('new messages deform one shared intent field instead of replacing prior unfinished work', async () => {
  let hostRuns = 0;
  let researchRuns = 0;
  const runtime = new MondayRuntime({ capabilities:{} });

  const first = await runtime.cycle([{id:'old-host', text:'finish iphone host', priority:80}]);
  assert.equal(first.intents['old-host'].status, 'active');

  runtime.capabilities.host = {
    name:'host',
    execute:async()=>{ hostRuns += 1; return {ok:true}; },
    verify:async result=>({ok:result.ok})
  };
  runtime.capabilities.research = {
    name:'research',
    execute:async()=>{ researchRuns += 1; return {ok:true}; },
    verify:async result=>({ok:result.ok})
  };

  const second = await runtime.cycle([{id:'new-research', text:'research quantum qml', priority:70}]);

  assert.equal(second.ok, true);
  assert.equal(hostRuns, 1);
  assert.equal(researchRuns, 1);
  assert.equal(second.intents['old-host'].status, 'fulfilled');
  assert.equal(second.intents['new-research'].status, 'fulfilled');

  const activeSignals = second.graph.nodes.filter(n => n.type === 'signal').map(n => n.id);
  assert.ok(activeSignals.includes('old-host'));
  assert.ok(activeSignals.includes('new-research'));
});
