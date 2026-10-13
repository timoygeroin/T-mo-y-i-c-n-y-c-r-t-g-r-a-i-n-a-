import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWorldlineSnapshot } from '../src/remote-worldline.mjs';
import { TrustedWorldlineReceptor } from '../src/trusted-worldline-receptor.mjs';

test('trusted snapshot read sends reader bearer from server configuration only',async()=>{
  const requests=[];
  const snapshot={schema:'mondayid.worldline.snapshot.v0.4.0',trust:'AUTHENTICATED_MACHINE_WRITER',readOnly:true,events:[]};
  const out=await fetchWorldlineSnapshot({
    baseUrl:'https://worldline.example.test',
    readerToken:'read-only-secret',
    fetchImpl:async (url,options)=>{
      requests.push({url:String(url),options});
      return {ok:true,status:200,json:async()=>snapshot};
    }
  });
  assert.equal(out.ok,true);
  assert.equal(requests.length,1);
  assert.equal(requests[0].options.headers.authorization,'Bearer read-only-secret');
  assert.equal(JSON.stringify(out).includes('read-only-secret'),false);
});

test('exact event readback sends reader bearer instead of public anonymous GET',async()=>{
  const requests=[];
  const receptor=new TrustedWorldlineReceptor({
    baseUrl:'https://worldline.example.test',
    readerToken:'read-only-secret',
    token:'writer-only-secret',
    fetchImpl:async (url,options)=>{
      requests.push({url:String(url),options});
      return {ok:true,status:200,json:async()=>({
        schema:'mondayid.worldline.event.v0.4.0',
        event:{eventId:'proof:1',valueJson:'{}',identityFingerprint:'mondayid:rewrite:g5'},
        conflicts:[]
      })};
    }
  });
  const result=await receptor.verify({ok:true,event:{eventId:'proof:1',valueJson:'{}'}});
  assert.equal(result.ok,true);
  assert.equal(requests.length,1);
  assert.equal(requests[0].options.headers.authorization,'Bearer read-only-secret');
  assert.equal(JSON.stringify(result).includes('read-only-secret'),false);
});
