import test from 'node:test';
import assert from 'node:assert/strict';
import { sensePhysiology, regulatePhysiology } from '../src/physiology-field.mjs';
import { MondayRuntime } from '../src/runtime.mjs';
import { Worldline } from '../src/worldline.mjs';
import { ActionLedger } from '../src/action-ledger.mjs';

test('baseline physiology conserves resources and never invents unavailable telemetry', () => {
  const snapshot=sensePhysiology({
    state:{intents:{},tasks:{},failures:{},receipts:{}},
    worldlineHeads:['root'],
    actionLedger:[],
    frontier:{ready:[],blocked:[],parallel:[]}
  });
  const regulation=regulatePhysiology(snapshot);
  assert.equal(snapshot.schema,'mondayid.physiology.v1');
  assert.equal(snapshot.contextPressure.status,'UNKNOWN');
  assert.equal(snapshot.energy.status,'UNKNOWN');
  assert.equal(regulation.mode,'BASELINE');
  assert.equal(regulation.computeFloor,'LOW');
  assert.equal(regulation.verificationStrictness,'NORMAL');
  assert.equal(regulation.freezeExpansion,false);
  assert.equal(regulation.reconcileFirst,false);
});

test('divergence or ambiguous actions trigger stabilization before expansion', () => {
  const snapshot=sensePhysiology({
    state:{
      intents:{i1:{status:'active'}},
      tasks:{t1:{status:'active',openRemainder:['x'],blockers:['y']}},
      failures:{f1:{code:'READBACK_UNRESOLVED'}},
      receipts:{}
    },
    worldlineHeads:['head-a','head-b'],
    actionLedger:[{state:'AMBIGUOUS'},{state:'EXECUTING'}],
    frontier:{ready:[{id:'a'}],blocked:[{id:'b'}],parallel:[{id:'a'}]}
  });
  const regulation=regulatePhysiology(snapshot);
  assert.equal(snapshot.branchDivergence,1);
  assert.equal(snapshot.ambiguousActions,1);
  assert.equal(regulation.mode,'STABILIZE');
  assert.equal(regulation.reconcileFirst,true);
  assert.equal(regulation.freezeExpansion,true);
  assert.equal(regulation.verificationStrictness,'STRICT');
  assert.ok(regulation.pressure > 0.5);
});

test('capability deficit without instability raises exploration and compute rather than freezing', () => {
  const snapshot=sensePhysiology({
    state:{intents:{i1:{status:'active'}},tasks:{},failures:{},receipts:{}},
    worldlineHeads:['root'],
    actionLedger:[],
    frontier:{
      ready:[{id:'ready'}],
      blocked:[{id:'b1'},{id:'b2'},{id:'b3'}],
      parallel:[{id:'ready'}]
    }
  });
  const regulation=regulatePhysiology(snapshot);
  assert.equal(regulation.mode,'EXPLORE');
  assert.equal(regulation.freezeExpansion,false);
  assert.equal(regulation.reconcileFirst,false);
  assert.ok(['HIGH','MAX'].includes(regulation.computeFloor));
  assert.ok(regulation.explorationBias > 0.5);
});

test('runtime observation exposes physiology and allostatic regulation as control state', () => {
  const worldline=new Worldline();
  const runtime=new MondayRuntime({worldline,capabilities:{}});
  const observed=runtime.observe([{
    id:'signal:physiology',
    text:'Need an external effect',
    domains:['external'],
    desiredEffect:'produce external verified effect'
  }]);
  assert.equal(observed.physiology.schema,'mondayid.physiology.v1');
  assert.equal(observed.regulation.schema,'mondayid.allostatic-regulation.v1');
  assert.equal(observed.regulation.mode,'EXPLORE');
  assert.ok(observed.frontier.blocked.length > 0);
});
