import test from 'node:test';
import assert from 'node:assert/strict';
import { TrustedWorldlineReceptor } from '../src/trusted-worldline-receptor.mjs';

test('trusted receptor writes then verifies exact external effect', async () => {
  const calls = [];
  const receptor = new TrustedWorldlineReceptor({
    baseUrl:'https://example.test',
    token:'secret',
    identityFingerprint:'id-1',
    fetchImpl:async (url, init) => {
      calls.push({url:String(url),init});
      if (init?.method === 'POST') {
        const event = JSON.parse(init.body);
        return {
          ok:true,status:201,
          json:async()=>({ok:true,schema:'mondayid.worldline.write-receipt.v0.4.0',status:'INSERTED',event:{...event,writerKeyId:'k1'}})
        };
      }
      const eventId = new URL(String(url)).searchParams.get('eventId');
      const written = JSON.parse(calls[0].init.body);
      return {
        ok:true,status:200,
        json:async()=>({
          schema:'mondayid.worldline.event.v0.4.0',
          event:{...written,eventId,writerKeyId:'k1'},
          conflicts:[]
        })
      };
    }
  });

  const action={objectiveId:'o1',sourceSignal:'s1',domain:'continuity',effect:'persist state'};
  const result=await receptor.execute(action);
  assert.equal(result.ok,true);
  assert.equal(result.status,'INSERTED');
  assert.match(calls[0].init.headers.authorization,/^Bearer /);

  const proof=await receptor.verify(result);
  assert.equal(proof.ok,true);
  assert.equal(proof.mode,'external-exact-readback');
});

test('trusted receptor refuses to claim success on conflict', async () => {
  const receptor = new TrustedWorldlineReceptor({
    baseUrl:'https://example.test',
    token:'secret',
    fetchImpl:async()=>({
      ok:false,status:409,
      json:async()=>({ok:false,status:'CONFLICT_UNRESOLVED'})
    })
  });
  const out=await receptor.execute({objectiveId:'o',effect:'x'});
  assert.equal(out.ok,false);
  assert.equal(out.code,'WORLDLINE_CONFLICT');
});

test('writer token never appears in generated event payload', () => {
  const receptor = new TrustedWorldlineReceptor({
    baseUrl:'https://example.test',
    token:'top-secret-token'
  });
  const event=receptor.eventFor({objectiveId:'o',effect:'x'});
  assert.equal(JSON.stringify(event).includes('top-secret-token'),false);
});
