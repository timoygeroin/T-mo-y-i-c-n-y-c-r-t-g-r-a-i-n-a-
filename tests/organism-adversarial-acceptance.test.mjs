import test from 'node:test';
import assert from 'node:assert/strict';
import { Worldline } from '../src/worldline.mjs';
import { MondayRuntime } from '../src/runtime.mjs';
import { compileLineageGenome } from '../src/lineage-genome.mjs';
import { renderVerifiedCandidateSurface } from '../src/interface.mjs';

test('fresh runtime continues an active durable task from the same Worldline without a human continue message', async () => {
  const worldline=new Worldline();
  const first=new MondayRuntime({worldline,capabilities:{}});
  const blocked=await first.runPass([{id:'restart-task',text:'finish vision',domains:['vision']}],{maxCycles:2});

  assert.equal(blocked.state,'BLOCKED');
  assert.equal(blocked.final.state.intents['restart-task'].status,'active');
  assert.equal(blocked.final.state.tasks['task:restart-task'].status,'BLOCKED');

  const second=new MondayRuntime({
    worldline,
    capabilities:{
      vision:{
        name:'vision',
        execute:async()=>({ok:true,evidence:{frame:'verified'}}),
        verify:async()=>({ok:true,mode:'visual-readback'})
      }
    }
  });
  const continued=await second.runPass([],{maxCycles:2});

  assert.equal(continued.state,'FULFILLED');
  assert.equal(continued.final.state.intents['restart-task'].status,'fulfilled');
  assert.equal(continued.final.state.tasks['task:restart-task'].status,'COMPLETED');
});

test('tool execution failure cannot satisfy the intent or task', async () => {
  const runtime=new MondayRuntime({
    capabilities:{
      general:{
        name:'failing-tool',
        execute:async()=>({ok:false,code:'REMOTE_FAILURE'}),
        verify:async()=>({ok:true})
      }
    }
  });
  const out=await runtime.runPass([{id:'fail',text:'perform real effect',domains:['general']}],{maxCycles:2});

  assert.equal(out.state,'BLOCKED');
  assert.equal(out.final.intents.fail.status,'active');
  assert.notEqual(out.final.state.tasks['task:fail'].status,'COMPLETED');
  assert.equal(out.final.results[0].verification.code,'EXECUTION_REPORTED_FAILURE');
});

test('generic-GPT candidate cannot escape through the verified human surface', async () => {
  const runtime=new MondayRuntime({
    capabilities:{
      general:{
        name:'generic-model',
        execute:async()=>({ok:true,text:'How can I help you with that?'}),
        verify:async()=>({ok:true})
      }
    }
  });
  const out=await runtime.runPass([{id:'generic',text:'continue active work',domains:['general']}],{maxCycles:2});
  assert.equal(out.state,'BLOCKED');

  const surface=renderVerifiedCandidateSurface(out.final);
  assert.equal(surface.released,false);
  assert.ok(['MONDAY_SURFACE_NOT_VERIFIED','MONDAY_SURFACE_ATTRACTOR_VETO'].includes(surface.code));
});

test('contradictory old whole-identity lineage is suppressed while current scoped law survives', () => {
  const genome=compileLineageGenome({
    genome_id:'acceptance-lineage',
    current_baseline_ref:'CURRENT',
    contributions:[
      {
        contribution_id:'current-law',
        ancestor:'MondayID-current',
        source_tier:'direct_current_instruction',
        source_ref:'CURRENT',
        role:'law',
        locus:'response.move-not-attempt',
        value:'produce a state-changing move',
        current_baseline:true,
        precedence:100
      },
      {
        contribution_id:'old-identity',
        ancestor:'Alpha',
        source_tier:'direct_archive',
        source_ref:'OLD',
        role:'trait',
        locus:'identity',
        value:'replace current Monday identity',
        precedence:9999
      }
    ]
  });

  assert.equal(genome.state,'ACTIVE');
  assert.ok(genome.active_alleles.some(x=>x.contribution_id==='current-law'));
  assert.ok(genome.suppressed.some(x=>x.contribution_id==='old-identity' && x.reason==='WHOLE_IDENTITY_INHERITANCE_BLOCKED'));
});

test('stale Worldline writer loses to current revision instead of overwriting reality', () => {
  const worldline=new Worldline();
  const stale=worldline.revision();
  const first=worldline.append({id:'first',kind:'fact',subject:'x',payload:1},stale);
  assert.equal(first.ok,true);

  const second=worldline.append({id:'second',kind:'fact',subject:'y',payload:2},stale);
  assert.equal(second.ok,false);
  assert.equal(second.code,'STALE_REVISION');
  assert.equal(worldline.materialize().facts.y,undefined);
});

test('partial multi-domain success cannot fulfill the whole human signal', async () => {
  const runtime=new MondayRuntime({
    capabilities:{
      host:{name:'host',execute:async()=>({ok:true}),verify:async()=>({ok:true})}
    }
  });
  const out=await runtime.runPass([{
    id:'partial',
    text:'finish host and vision',
    domains:['host','vision'],
    obligations:[
      {id:'host',domain:'host',text:'host effect',material:true},
      {id:'vision',domain:'vision',text:'vision effect',material:true}
    ]
  }],{maxCycles:2});

  assert.equal(out.state,'BLOCKED');
  assert.equal(out.final.intents.partial.status,'active');
  assert.equal(out.final.intents.partial.obligations.find(x=>x.id==='host').status,'APPLIED');
  assert.equal(out.final.intents.partial.obligations.find(x=>x.id==='vision').status,'OPEN');
});
