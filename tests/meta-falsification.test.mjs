import test from 'node:test';
import assert from 'node:assert/strict';
import {OrganismCell} from '../src/organism-cell.mjs';
import {CausalLineage} from '../src/causal-lineage.mjs';

test('Anti rejects a verified counterexample targeting the current candidate',async()=>{
 const lineage=new CausalLineage();
 lineage.append({kind:'failure',subject:'example',
  after:{targetMutationId:'candidate-1',counterexample:'reproduced negative observation'},
  evidence:['readback-negative'],epistemic:'verified'});
 const cell=new OrganismCell({id:'cell',lineage,
   miniDima:async()=>({verdict:'SUPPORTED',evidence:['current-direct']})});
 const before=lineage.snapshot().length;
 const out=await cell.evaluateMutation({subject:'example',
  mutation:{id:'candidate-1',statement:'candidate statement'},
  evidence:['positive'],verification:{ok:true,mode:'external-exact-readback',evidenceRef:'positive'}});
 assert.equal(out.ok,false);
 assert.equal(out.code,'ANTI_ACTIVE_COUNTEREXAMPLE');
 assert.equal(lineage.snapshot().length,before);
});

test('Anti refuses a self-attested verification even if positive evidence is listed',async()=>{
 const cell=new OrganismCell({id:'cell',
  miniDima:async()=>({verdict:'SUPPORTED',evidence:['current-direct']})});
 const out=await cell.evaluateMutation({subject:'example',
  mutation:{id:'candidate-2',statement:'candidate'},
  evidence:['listed-positive'],verification:{ok:true,mode:'self-attested',evidenceRef:'self'}});
 assert.equal(out.ok,false);
 assert.equal(out.code,'ANTI_SELF_CERTIFICATION');
});
