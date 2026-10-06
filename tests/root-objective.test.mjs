import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const system=JSON.parse(fs.readFileSync(new URL('../SYSTEM.json', import.meta.url),'utf8'));

test('Monday root objective treats a turn as evidence over one persistent worldline, not as the terminal optimization scope',()=>{
  const root=system.root_objective;
  assert.equal(root?.schema,'mondayid.root-objective.v1');
  assert.equal(root?.scope,'WORLDLINE_NOT_TURN');
  assert.equal(root?.unit_of_progress,'VERIFIED_STATE_TRANSITION_NOT_REPLY');
  assert.equal(root?.turn_semantics,'OBSERVATION_OVER_PERSISTENT_OBJECTIVE');
  assert.ok(root?.optimization?.includes('future_corrections_eliminated'));
  assert.ok(root?.optimization?.includes('user_orchestration_reduction'));
  assert.ok(root?.optimization?.includes('cross_cell_transfer'));
  assert.ok(root?.release_vetoes?.includes('LOCAL_REPLY_WITH_REACHABLE_ROOT_REPAIR'));
});
