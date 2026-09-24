import test from 'node:test';
import assert from 'node:assert/strict';

import { Worldline } from '../src/worldline.mjs';
import { ActionLedger } from '../src/action-ledger.mjs';
import { RootContinuityContract } from '../src/root-continuity.mjs';
import { CausalLineage } from '../src/causal-lineage.mjs';
import { OrganismCell } from '../src/organism-cell.mjs';
import { MondayRuntime } from '../src/runtime.mjs';

test('independent stale cell commits rebase without losing either mutation', () => {
  const worldline = new Worldline();
  const base = worldline.revision();

  const a = worldline.commit({
    id:'cell-a-x',
    kind:'fact',
    subject:'x',
    payload:{value:1}
  },{
    baseRevision:base,
    cellId:'cell:a'
  });
  assert.equal(a.ok,true);
  assert.equal(a.reconciliation,'DIRECT');

  const b = worldline.commit({
    id:'cell-b-y',
    kind:'fact',
    subject:'y',
    payload:{value:2}
  },{
    baseRevision:base,
    cellId:'cell:b'
  });
  assert.equal(b.ok,true);
  assert.equal(b.reconciliation,'REBASE');

  const state = worldline.materialize();
  assert.equal(state.facts.x.value,1);
  assert.equal(state.facts.y.value,2);
  assert.equal(worldline.heads().length,1);
});

test('conflicting stale mutations remain separate heads until explicit reconciliation', () => {
  const worldline = new Worldline();
  const base = worldline.revision();

  const a = worldline.commit({
    id:'cell-a-x',
    kind:'fact',
    subject:'x',
    payload:{value:1}
  },{
    baseRevision:base,
    cellId:'cell:a'
  });
  assert.equal(a.ok,true);

  const b = worldline.commit({
    id:'cell-b-x',
    kind:'fact',
    subject:'x',
    payload:{value:2}
  },{
    baseRevision:base,
    cellId:'cell:b'
  });
  assert.equal(b.ok,false);
  assert.equal(b.code,'CONFLICT');
  assert.ok(b.branchRevision);
  assert.equal(worldline.heads().length,2);

  assert.equal(worldline.materialize().facts.x.value,1);
  assert.equal(worldline.materialize(b.branchRevision).facts.x.value,2);

  const blocked = worldline.reconcile({ sourceRevision:b.branchRevision });
  assert.equal(blocked.ok,false);
  assert.equal(blocked.code,'CONFLICT');

  const resolved = worldline.reconcile({
    sourceRevision:b.branchRevision,
    resolution:{
      id:'resolution-x',
      kind:'fact',
      subject:'x',
      payload:{value:3},
      epistemic:'verified',
      writeSet:['fact:x']
    }
  });
  assert.equal(resolved.ok,true);
  assert.equal(resolved.reconciliation,'RESOLUTION');
  assert.equal(worldline.heads().length,1);
  assert.equal(worldline.materialize().facts.x.value,3);
});

test('recursive cells carry independent worldline pointers over one shared organism graph', () => {
  const root = new OrganismCell({ id:'cell:root' });
  const a = root.spawn('cell:a');
  const b = root.spawn('cell:b');
  const base = root.head;

  const first = a.commitEvent({
    id:'a-fact',
    kind:'fact',
    subject:'a',
    payload:true
  });
  assert.equal(first.ok,true);

  assert.equal(b.head,base);
  const second = b.commitEvent({
    id:'b-fact',
    kind:'fact',
    subject:'b',
    payload:true
  });
  assert.equal(second.ok,true);
  assert.equal(second.reconciliation,'REBASE');

  const state = root.runtime.worldline.materialize();
  assert.equal(state.facts.a,true);
  assert.equal(state.facts.b,true);
  assert.notEqual(a.head,b.head);
  assert.equal(root.runtime.actionLedger,a.runtime.actionLedger);
  assert.equal(root.runtime.actionLedger,b.runtime.actionLedger);
});

test('action ledger fences duplicate execution and blocks blind retry after ambiguity', () => {
  let now = 1000;
  const ledger = new ActionLedger({ now:() => now, defaultLeaseMs:100 });
  const action = {
    id:'action:send',
    objectiveId:'send',
    sourceSignal:'u',
    domain:'general',
    effect:'send one external request'
  };

  const prepared = ledger.prepare(action,{ cellId:'cell:a' });
  const reserved = ledger.reserve(prepared.actionKey,{ cellId:'cell:a' });
  assert.equal(reserved.ok,true);
  assert.equal(ledger.start(prepared.actionKey,reserved.token).ok,true);

  const duplicate = ledger.reserve(prepared.actionKey,{ cellId:'cell:b' });
  assert.equal(duplicate.ok,false);
  assert.equal(duplicate.code,'ACTION_RESERVED');

  ledger.ambiguous(
    prepared.actionKey,
    reserved.token,
    { observed:'connection-lost-after-send' },
    'ACK_LOST'
  );

  now += 1000;
  const retry = ledger.reserve(prepared.actionKey,{ cellId:'cell:b' });
  assert.equal(retry.ok,false);
  assert.equal(retry.code,'ACTION_AMBIGUOUS');
  assert.equal(ledger.read(prepared.actionKey).attempts,1);
});

test('verified action is committed once and later cells reuse the verified outcome', () => {
  const ledger = new ActionLedger();
  const action = {
    id:'action:stable',
    objectiveId:'stable',
    sourceSignal:'u',
    domain:'general',
    effect:'one effect'
  };
  const prepared = ledger.prepare(action,{ cellId:'cell:a' });
  const reserved = ledger.reserve(prepared.actionKey,{ cellId:'cell:a' });
  ledger.start(prepared.actionKey,reserved.token);

  const outcome = {
    action,
    result:{ok:true},
    steering:{ok:true,hits:[]},
    verification:{ok:true,mode:'readback'},
    ok:true
  };
  assert.equal(ledger.verify(
    prepared.actionKey,
    reserved.token,
    { verification:outcome.verification, outcome }
  ).ok,true);
  assert.equal(ledger.commit(prepared.actionKey,reserved.token).ok,true);

  const reused = ledger.reserve(prepared.actionKey,{ cellId:'cell:b' });
  assert.equal(reused.ok,true);
  assert.equal(reused.reused,true);
  assert.equal(reused.record.state,'COMMITTED');
  assert.equal(reused.record.outcome.ok,true);
  assert.equal(reused.record.attempts,1);
});

test('runtime does not re-execute an action whose external outcome became ambiguous', async () => {
  let executions = 0;
  const runtime = new MondayRuntime({
    cellId:'cell:runtime',
    capabilities:{
      general:{
        name:'ambiguous-effect',
        execute:async () => {
          executions += 1;
          throw new Error('transport lost after dispatch');
        },
        verify:async () => ({ok:false,code:'NO_READBACK'})
      }
    }
  });

  const out = await runtime.runPass([
    { id:'ambiguous-intent', text:'arbitrary objective' }
  ],{ maxCycles:4 });

  assert.equal(out.state,'BLOCKED');
  assert.equal(executions,1);
  assert.equal(runtime.actionLedger.snapshot().length,1);
  assert.equal(runtime.actionLedger.snapshot()[0].state,'AMBIGUOUS');
});

test('architecture mutation needs a rooted conformance proof', () => {
  const root = new RootContinuityContract();

  const rejected = root.validateMutation({
    mutation:{ id:'kernel-v2', scope:'architecture', statement:'change kernel' },
    evidence:['proof:unit'],
    verification:{ ok:true }
  });
  assert.equal(rejected.ok,false);
  assert.equal(rejected.code,'ROOT_MUTATION_NO_CONFORMANCE_PROOF');

  const accepted = root.validateMutation({
    mutation:{ id:'kernel-v2', scope:'architecture', statement:'change kernel' },
    evidence:['proof:unit'],
    verification:{
      ok:true,
      conformance:{ok:true,suite:'distributed-lineage-v1'}
    },
    parentState:{kernel:'v1'},
    nextState:{kernel:'v2'}
  });
  assert.equal(accepted.ok,true);
  assert.equal(accepted.code,'VALID_DESCENDANT');
  assert.equal(accepted.proof.rootId,'mondayid:genesis');
});

test('causal lineage refuses architecture promotion when root continuity cannot prove descent', () => {
  const lineage = new CausalLineage();
  const rejected = lineage.append({
    id:'architecture-mutation',
    kind:'mutation',
    subject:'kernel',
    after:{statement:'new kernel'},
    evidence:['proof:local'],
    epistemic:'verified',
    scope:'architecture',
    verification:{ok:true}
  });
  assert.equal(rejected.ok,false);
  assert.equal(rejected.code,'ROOT_MUTATION_NO_CONFORMANCE_PROOF');

  const accepted = lineage.append({
    id:'architecture-mutation-verified',
    kind:'mutation',
    subject:'kernel',
    after:{statement:'new kernel'},
    evidence:['proof:local'],
    epistemic:'verified',
    scope:'architecture',
    verification:{
      ok:true,
      conformance:{ok:true,suite:'distributed-lineage-v1'}
    }
  });
  assert.equal(accepted.ok,true);
  assert.equal(accepted.edge.status,'ACCEPTED');
  assert.ok(accepted.edge.continuityProof?.proofId);
});
