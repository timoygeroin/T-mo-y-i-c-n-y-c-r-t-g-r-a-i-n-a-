import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAutopoiesisPass } from '../src/autopoiesis-kernel.mjs';

test('repeated correction is treated as failed transfer and root repair outranks another reply',()=>{
  const out=compileAutopoiesisPass({
    signal:{ repeatedCorrection:true, currentTurnSatisfied:true },
    system:{ root_objective:{scope:'WORLDLINE_NOT_TURN'} },
    runtime:{ openTasks:[], capabilityGaps:[] }
  });
  assert.equal(out.state,'ACT');
  assert.equal(out.action.kind,'REPAIR_REGRESSION');
  assert.equal(out.action.reason,'FAILED_TRANSFER');
  assert.equal(out.notifyUser,false);
});

test('structural residual capability gap evolves instead of waiting for Dima',()=>{
  const out=compileAutopoiesisPass({
    system:{ root_objective:{scope:'WORLDLINE_NOT_TURN'} },
    runtime:{ openTasks:[{id:'t1',status:'BLOCKED'}], capabilityGaps:[{id:'g1',reversible:true,requiresHuman:false}] }
  });
  assert.equal(out.state,'ACT');
  assert.equal(out.action.kind,'EVOLVE_CAPABILITY');
  assert.equal(out.action.gapId,'g1');
  assert.equal(out.requiresHuman,false);
});

test('quota exhaustion is a route failure and preserves the durable task',()=>{
  const out=compileAutopoiesisPass({
    system:{ root_objective:{scope:'WORLDLINE_NOT_TURN'} },
    runtime:{
      openTasks:[{id:'t2',status:'BLOCKED'}],
      routeFailures:[{code:'QUOTA_EXHAUSTED',route:'vercel'}],
      alternateRoutes:['github-actions','current-host-tools'],
      capabilityGaps:[]
    }
  });
  assert.equal(out.state,'ACT');
  assert.equal(out.action.kind,'REROUTE_PRESERVE_TASK');
  assert.equal(out.action.taskId,'t2');
  assert.equal(out.action.route,'github-actions');
});

test('irreducible auth spend secret or physical gate stops safely and asks only for the exact gate',()=>{
  const out=compileAutopoiesisPass({
    system:{ root_objective:{scope:'WORLDLINE_NOT_TURN'} },
    runtime:{
      openTasks:[{id:'t3',status:'BLOCKED'}],
      humanGates:[{id:'billing',type:'SPEND',effect:'enable paid deployment'}]
    }
  });
  assert.equal(out.state,'HUMAN_GATE');
  assert.equal(out.action.kind,'REQUEST_HUMAN_GATE');
  assert.equal(out.action.gateId,'billing');
  assert.equal(out.requiresHuman,true);
  assert.equal(out.notifyUser,true);
});

test('healthy organism with no open material work stays quiet',()=>{
  const out=compileAutopoiesisPass({
    system:{ root_objective:{scope:'WORLDLINE_NOT_TURN'} },
    runtime:{ openTasks:[], capabilityGaps:[], routeFailures:[], humanGates:[] }
  });
  assert.equal(out.state,'IDLE');
  assert.equal(out.action,null);
  assert.equal(out.notifyUser,false);
});
