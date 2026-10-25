import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../deus0.html',import.meta.url),'utf8');
const shell=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function browser(fetcher){
 const elements=new Map();
 const node=(id='')=>({
  id,hidden:false,disabled:false,value:'4',textContent:'',children:[],attrs:{},dataset:{},
  listeners:{},appendChild(child){this.children.push(child);return child},
  replaceChildren(...items){this.children=items},setAttribute(k,v){this.attrs[k]=v},
  addEventListener(k,fn){this.listeners[k]=fn},
  scrollIntoView(){}
 });
 for(const id of ['budget','budgetValue','run','error','result','verdict','outcome','coverage','explored','vetoed','gap','trace','receipt','copy','export'])elements.set(id,node(id));
 const choices=['observer','vision'].map(key=>{const n=node();n.dataset.scenario=key;return n});
 const document={getElementById:id=>elements.get(id),querySelectorAll:selector=>selector==='[data-scenario]'?choices:[],
  createElement:tag=>node(tag),body:{appendChild(){}}};
 const code=html.split('<script>')[1]?.split('</script>')[0];
 assert.ok(code,'inline DEUS interface script found');
 const ctx={document,fetch:fetcher,navigator:{},console,Number,String,JSON,Math,Error};
 vm.runInNewContext(code,ctx,{timeout:3000});
 return {elements,choices};
}
const hypothesis={
 schema:'mondayid.deus0.simulation.v1',epistemic:'hypothetical',
 state:'SIMULATED_GOAL_REACHED',exhaustive:true,externalActionsExecuted:0,
 independentRealityReadback:false,
 search:{explored:6,rejected:{invariant:2}},
 proposal:{goalGap:0,steps:['recover_lineage','reconstruct_intent','transfer_cell','independent_readback']},
 receipt:'sha256:'+'a'.repeat(64)
};

test('iPhone UI has one same-origin World Lab entry, not a new host service',()=>{
 assert.match(shell,/Open DEUS-0 World Lab/);
 assert.match(shell,/deusLink\.href='\/deus0'/);
 assert.match(shell,/DEUS-0 World Lab/);
 assert.match(html,/name="viewport"/);
 assert.match(html,/href="\/"/);
 assert.match(html,/fetch\('\/api\/deus0'/);
 assert.doesNotMatch(html,/MONDAYID_HOST_TOKEN|openai\.com|dangerouslySetInnerHTML|innerHTML\s*=/);
});
test('client submits bounded synthetic model, then shows proof without claiming execution',async()=>{
 let sent=null;
 const b=browser(async(url,init)=>{
  sent={url,init};return {ok:true,json:async()=>({ok:true,report:hypothesis})};
 });
 await b.elements.get('run').listeners.click();
 assert.equal(sent.url,'/api/deus0');
 assert.equal(sent.init.method,'POST');
 assert.equal(sent.init.cache,'no-store');
 const m=JSON.parse(sent.init.body).model;
 assert.equal(m.id,'last-observer-synthetic');
 assert.equal(m.maxNodes,256);
 assert.equal(m.constraints.credits.max,4);
 assert.equal(b.elements.get('result').hidden,false);
 assert.equal(b.elements.get('vetoed').textContent,'2');
 assert.equal(b.elements.get('trace').children.length,4);
 assert.match(b.elements.get('verdict').textContent,/НЕ В МИРЕ/);
});
test('changing scene and cost rewrites model inputs without carrying stale report',async()=>{
 let sent=null;
 const b=browser(async(_,init)=>{sent=JSON.parse(init.body).model;return {ok:true,json:async()=>({ok:true,report:hypothesis})}});
 b.choices[1].listeners.click();
 b.elements.get('budget').listeners.input({target:{value:'2'}});
 assert.equal(b.elements.get('result').hidden,true);
 assert.equal(b.choices[1].attrs['aria-pressed'],'true');
 await b.elements.get('run').listeners.click();
 assert.equal(sent.id,'mondayvision-anti-loop-synthetic');
 assert.equal(sent.constraints.credits.max,2);
 assert.equal(sent.horizon,3);
});
test('failed or unverified response is rendered as failure, never simulated success',async()=>{
 const b=browser(async()=>({ok:true,json:async()=>({ok:true,report:{...hypothesis,independentRealityReadback:true}})}));
 await b.elements.get('run').listeners.click();
 assert.equal(b.elements.get('error').hidden,false);
 assert.equal(b.elements.get('result').hidden,true);
 assert.match(b.elements.get('error').textContent,/SIMULATION_PROOF_MISSING/);
});
