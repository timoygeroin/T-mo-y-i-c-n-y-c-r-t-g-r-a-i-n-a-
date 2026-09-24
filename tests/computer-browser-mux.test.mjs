import test from 'node:test';
import assert from 'node:assert/strict';

import { createBrowserComputerReceptor } from '../src/execution/browser-computer-receptor.mjs';
import { createReceptorMux } from '../src/execution/receptor-mux.mjs';

test('owned browser receptor separates action from independent observation', async () => {
  const state={url:'about:blank',text:''};
  const driver={
    async perform(step) {
      if (step.type === 'open') state.url=step.url;
      if (step.type === 'set-text') state.text=step.value;
      return {ok:true,step:{...step}};
    },
    async observe(probe) {
      if (probe.type === 'url') return {ok:true,value:state.url};
      if (probe.type === 'text') return {ok:true,value:state.text};
      return {ok:false,value:null};
    }
  };
  const receptor=createBrowserComputerReceptor({driver});
  const action={
    domain:'host',
    effect:'open owned browser proof',
    routeCandidate:{
      kind:'browser',
      steps:[{type:'open',url:'https://example.test/proof'},{type:'set-text',value:'browser-ok'}],
      verification:{
        probe:{type:'text'},
        acceptance:{equals:'browser-ok',ok:true}
      }
    }
  };
  assert.equal(receptor.supports(action),true);
  const result=await receptor.execute(action);
  assert.equal(result.ok,true);
  const verification=await receptor.verify(result,action);
  assert.equal(verification.ok,true);
  assert.equal(verification.mode,'independent-browser-readback');
});

test('computer mux selects exactly one owned organ by explicit route kind', async () => {
  const calls=[];
  const process={
    name:'process-organ',
    exposes:['workspace.execute'],
    supports:action=>action?.routeCandidate?.kind === 'workspace-exec',
    execute:async()=>{calls.push('process'); return {ok:true};},
    verify:async()=>({ok:true,mode:'process-readback'})
  };
  const browser={
    name:'browser-organ',
    exposes:['browser.interact'],
    supports:action=>action?.routeCandidate?.kind === 'browser',
    execute:async()=>{calls.push('browser'); return {ok:true};},
    verify:async()=>({ok:true,mode:'browser-readback'})
  };
  const mux=createReceptorMux({receptors:[process,browser]});

  const browserAction={domain:'host',routeCandidate:{kind:'browser'}};
  assert.equal(mux.supports(browserAction),true);
  const envelope=await mux.execute(browserAction);
  assert.equal(envelope.receptor,'browser-organ');
  assert.deepEqual(calls,['browser']);
  const verification=await mux.verify(envelope,browserAction);
  assert.equal(verification.ok,true);
  assert.equal(verification.receptor,'browser-organ');
});

test('computer mux fails closed on ambiguous routing', async () => {
  const a={name:'a',supports:()=>true,execute:async()=>({ok:true}),verify:async()=>({ok:true})};
  const b={name:'b',supports:()=>true,execute:async()=>({ok:true}),verify:async()=>({ok:true})};
  const mux=createReceptorMux({receptors:[a,b]});
  assert.equal(mux.supports({domain:'host'}),false);
  const result=await mux.execute({domain:'host'});
  assert.equal(result.ok,false);
  assert.equal(result.code,'AMBIGUOUS_COMPUTER_ORGAN_ROUTE');
});
