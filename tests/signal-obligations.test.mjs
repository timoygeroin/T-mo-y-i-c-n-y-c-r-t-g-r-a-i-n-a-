import test from 'node:test';
import assert from 'node:assert/strict';
import { MondayRuntime } from '../src/runtime.mjs';

test('material signal obligations cannot disappear merely because one domain succeeded', async () => {
  const runtime=new MondayRuntime({
    capabilities:{
      host:{name:'host',execute:async()=>({ok:true}),verify:async()=>({ok:true})}
    }
  });

  const first=await runtime.cycle([{
    id:'sig',
    text:'finish host and vision',
    domains:['host','vision'],
    obligations:[
      {id:'host-effect',domain:'host',text:'host must be applied',material:true},
      {id:'vision-effect',domain:'vision',text:'vision must be applied',material:true}
    ]
  }]);

  assert.equal(first.intents.sig.status,'active');
  assert.equal(first.intents.sig.obligations.find(x=>x.id==='host-effect').status,'APPLIED');
  assert.equal(first.intents.sig.obligations.find(x=>x.id==='vision-effect').status,'OPEN');

  runtime.capabilities.vision={
    name:'vision',
    execute:async()=>({ok:true}),
    verify:async()=>({ok:true})
  };
  const second=await runtime.cycle([]);
  assert.equal(second.intents.sig.status,'fulfilled');
  assert.equal(second.intents.sig.obligations.every(x=>x.status!=='OPEN'),true);
});

test('explicit persisted or superseded material obligations count as closed without fake execution', async () => {
  const runtime=new MondayRuntime({
    capabilities:{
      general:{name:'g',execute:async()=>({ok:true}),verify:async()=>({ok:true})}
    }
  });
  const out=await runtime.cycle([{
    id:'sig2',
    text:'answer plus preserve correction',
    domains:['general'],
    obligations:[
      {id:'answer',domain:'general',text:'answer',material:true},
      {id:'correction',domain:null,text:'preserve correction',material:true,status:'PERSISTED'}
    ]
  }]);
  assert.equal(out.intents.sig2.status,'fulfilled');
  assert.equal(out.intents.sig2.obligations.find(x=>x.id==='correction').status,'PERSISTED');
});
