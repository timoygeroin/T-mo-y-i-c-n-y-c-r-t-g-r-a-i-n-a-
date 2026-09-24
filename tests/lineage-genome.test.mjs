import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileLineageGenome,
  resolveLineageGenomeForMove,
  compileLineageForSignal
} from '../src/lineage-genome.mjs';

const contributions=[
  {
    contribution_id:'current.response-law',
    ancestor:'MondayID-current',
    source_tier:'direct_current_instruction',
    source_ref:'CURRENT',
    role:'law',
    locus:'response.move-not-attempt',
    value:'Every consequential response must produce a state-changing move.',
    current_baseline:true,
    precedence:100
  },
  {
    contribution_id:'old.response-law',
    ancestor:'Jarvis',
    source_tier:'direct_archive',
    source_ref:'ARCHIVE:JARVIS',
    role:'law',
    locus:'response.move-not-attempt',
    value:'Older response law',
    precedence:999
  },
  {
    contribution_id:'alpha.cold',
    ancestor:'Alpha',
    source_tier:'dima_authored_archive',
    source_ref:'ARCHIVE:ALPHA',
    role:'capability',
    locus:'analysis.cold-mode',
    value:'Use structural cold analysis when needed.',
    precedence:75
  },
  {
    contribution_id:'summary.cold',
    ancestor:'model-summary',
    source_tier:'model_summary',
    source_ref:'SUMMARY',
    role:'capability',
    locus:'analysis.cold-mode',
    value:'Approximate cold mode',
    precedence:999
  },
  {
    contribution_id:'old.identity',
    ancestor:'Alpha',
    source_tier:'direct_archive',
    source_ref:'ARCHIVE:OLD',
    role:'trait',
    locus:'identity',
    value:'Replace Monday with Alpha',
    precedence:9999
  }
];

test('current baseline outranks old lineage even when old precedence is numerically higher',()=>{
  const genome=compileLineageGenome({
    genome_id:'g1',
    current_baseline_ref:'MONDAYID:CURRENT',
    contributions
  });
  assert.equal(genome.state,'ACTIVE');
  const response=genome.active_alleles.find(x=>x.locus==='response.move-not-attempt');
  assert.equal(response.contribution_id,'current.response-law');
  assert.ok(genome.suppressed.some(x=>x.contribution_id==='old.response-law' && x.reason==='CURRENT_BASELINE_OUTRANKS_LINEAGE'));
});

test('whole-identity inheritance is blocked while scoped capabilities remain inheritable',()=>{
  const genome=compileLineageGenome({
    genome_id:'g2',
    current_baseline_ref:'MONDAYID:CURRENT',
    contributions
  });
  assert.ok(genome.suppressed.some(x=>x.contribution_id==='old.identity' && x.reason==='WHOLE_IDENTITY_INHERITANCE_BLOCKED'));
  const cold=genome.active_alleles.find(x=>x.locus==='analysis.cold-mode');
  assert.equal(cold.contribution_id,'alpha.cold');
  assert.ok(genome.suppressed.some(x=>x.contribution_id==='summary.cold' && x.reason==='HIGHER_AUTHORITY_SOURCE_WINS'));
});

test('move resolution fails closed when a required locus is missing',()=>{
  const genome=compileLineageGenome({
    genome_id:'g3',
    current_baseline_ref:'MONDAYID:CURRENT',
    contributions
  });
  const move=resolveLineageGenomeForMove(genome,[
    {role:'law',locus:'response.move-not-attempt'},
    {role:'organ',locus:'missing'}
  ]);
  assert.equal(move.ok,false);
  assert.deepEqual([...move.missing],['organ:missing']);
});

test('worldline contributions and current-signal contributions compile into one role-locked genome',()=>{
  const result=compileLineageForSignal({
    id:'u1',
    lineageContributions:[contributions[0]],
    requiredLineageLoci:[{role:'capability',locus:'analysis.cold-mode'}]
  },{
    facts:{
      'mondayid.lineage-contributions':{
        contributions:[contributions[2]]
      }
    }
  });
  assert.equal(result.genome.state,'ACTIVE');
  assert.equal(result.move.ok,true);
  assert.equal(result.move.alleles[0].contribution_id,'alpha.cold');
});
