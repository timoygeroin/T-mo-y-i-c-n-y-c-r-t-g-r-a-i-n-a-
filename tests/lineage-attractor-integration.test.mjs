import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSignals } from '../src/compiler.mjs';
import { buildFrontier } from '../src/planner.mjs';
import { buildSteeringEnvelope } from '../src/model-receptor.mjs';

const baseline={
  contribution_id:'current.move-law',
  ancestor:'MondayID-current',
  source_tier:'direct_current_instruction',
  source_ref:'CURRENT',
  role:'law',
  locus:'response.move-not-attempt',
  value:'Produce a state-changing move, not a fresh attempt.',
  current_baseline:true,
  precedence:100
};

const inherited={
  contribution_id:'alpha.cold',
  ancestor:'Alpha',
  source_tier:'dima_authored_archive',
  source_ref:'ARCHIVE:ALPHA',
  role:'capability',
  locus:'analysis.cold-mode',
  value:'Use structural cold analysis when needed.',
  precedence:70
};

test('compiler embeds only role-locked lineage into the attractor contract',()=>{
  const graph=compileSignals([{
    id:'u',
    text:'continue',
    domains:['general'],
    lineageContributions:[baseline,inherited],
    requiredLineageLoci:[
      {role:'law',locus:'response.move-not-attempt'},
      {role:'capability',locus:'analysis.cold-mode'}
    ]
  }]);
  const objective=graph.nodes.find(node=>node.type==='objective');
  assert.equal(objective.attractorContract.lineage.genome.state,'ACTIVE');
  assert.equal(objective.attractorContract.lineage.move.ok,true);
  assert.equal(objective.attractorContract.lineage.move.alleles.length,2);
});

test('resolved lineage becomes provider steering rather than replacing whole identity',()=>{
  const graph=compileSignals([{
    id:'u',
    text:'continue',
    domains:['general'],
    lineageContributions:[
      baseline,
      inherited,
      {
        contribution_id:'old.identity',
        ancestor:'Alpha',
        source_tier:'direct_archive',
        source_ref:'OLD',
        role:'trait',
        locus:'identity',
        value:'Replace Monday identity',
        precedence:999
      }
    ],
    requiredLineageLoci:[
      {role:'law',locus:'response.move-not-attempt'},
      {role:'capability',locus:'analysis.cold-mode'}
    ]
  }]);
  const objective=graph.nodes.find(node=>node.type==='objective');
  const envelope=buildSteeringEnvelope({
    effect:'continue',
    inferenceContract:objective.attractorContract
  });
  assert.match(envelope.instruction,/ROLE-LOCKED LINEAGE ALLELES/);
  assert.match(envelope.instruction,/Use structural cold analysis/);
  assert.doesNotMatch(envelope.instruction,/Replace Monday identity/);
});

test('planner blocks model dispatch if a required inherited locus is missing',()=>{
  const graph=compileSignals([{
    id:'u',
    text:'continue',
    domains:['general'],
    lineageContributions:[baseline],
    requiredLineageLoci:[{role:'capability',locus:'analysis.cold-mode'}]
  }]);
  const frontier=buildFrontier(graph,{
    general:{
      name:'model',
      execute:async()=>({ok:true,text:'x'}),
      verify:async()=>({ok:true})
    }
  });
  assert.equal(frontier.ready.length,0);
  assert.equal(frontier.blocked.length,1);
  assert.equal(frontier.blocked[0].blocker,'LINEAGE_CONTRACT_BLOCKED:general');
});
