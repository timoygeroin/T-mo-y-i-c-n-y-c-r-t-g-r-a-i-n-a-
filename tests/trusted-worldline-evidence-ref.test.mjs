import test from 'node:test';
import assert from 'node:assert/strict';
import { TrustedWorldlineReceptor } from '../src/trusted-worldline-receptor.mjs';

test('trusted Worldline exact readback emits a stable evidence reference only for authenticated matching events', async () => {
  let written;
  const fetchImpl = async (_url, options = {}) => {
    if (options.method === 'POST') {
      written = JSON.parse(options.body);
      return { ok:true, status:201, json:async()=>({ok:true,status:'APPENDED'}) };
    }
    return {
      ok:true,
      json:async()=>({
        schema:'mondayid.worldline.event.v0.4.0',
        event:{...written,writerKeyId:'writer-1'},
        conflicts:[]
      })
    };
  };
  const receptor = new TrustedWorldlineReceptor({
    baseUrl:'https://example.test',token:'writer',
    readerToken:'reader',fetchImpl
  });
  const result = await receptor.execute({
    objectiveId:'objective-1',sourceSignal:'signal-1',
    domain:'continuity',effect:'persist evidence'
  });
  assert.equal(result.ok,true);
  const verified = await receptor.verify(result);
  assert.equal(verified.ok,true);
  assert.equal(verified.mode,'external-exact-readback');
  assert.equal(verified.evidenceRef,`worldline:v4:event:${result.event.eventId}`);
});

test('mismatched readback cannot produce an evidence reference', async () => {
  const receptor = new TrustedWorldlineReceptor({
    baseUrl:'https://example.test',token:'writer',
    fetchImpl:async()=>({
      ok:true,
      json:async()=>({
        schema:'mondayid.worldline.event.v0.4.0',
        event:{eventId:'different',writerKeyId:'writer-1'},
        conflicts:[]
      })
    })
  });
  const result = {ok:true,event:receptor.eventFor({sourceSignal:'signal-2'})};
  const verified = await receptor.verify(result);
  assert.equal(verified.ok,false);
  assert.equal(verified.evidenceRef,null);
});
