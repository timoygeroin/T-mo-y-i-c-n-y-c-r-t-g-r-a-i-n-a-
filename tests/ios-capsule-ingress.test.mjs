import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import handler from '../api/worldline/capsules.js';

const ENV=['MONDAYID_CAPSULE_INGEST_SECRET','MONDAYID_WORLDLINE_URL','MONDAYID_WORLDLINE_WRITER_TOKEN','MONDAYID_WORLDLINE_READ_TOKEN'];
function response(){return {statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};}
function capsule(){return {event_id:'ios-proof-00000001',source:'ios-monday',revision:1,timestamp:new Date().toISOString(),payload:{proof:'synthetic'}};}
async function run(body,auth='Bearer test-secret'){const res=response();await handler({method:'POST',headers:{authorization:auth},body},res);return res;}
test('capsule ingress rejects unauthenticated requests without contacting Worldline',async()=>{
 const previous=Object.fromEntries(ENV.map(k=>[k,process.env[k]]));const oldFetch=globalThis.fetch;
 try{
 process.env.MONDAYID_CAPSULE_INGEST_SECRET='test-secret';process.env.MONDAYID_WORLDLINE_URL='https://example.test';
 process.env.MONDAYID_WORLDLINE_WRITER_TOKEN='writer';process.env.MONDAYID_WORLDLINE_READ_TOKEN='reader';
 globalThis.fetch=()=>{throw Error('must not fetch');};
 assert.equal((await run(capsule(),'Bearer wrong')).statusCode,401);
 }finally{for(const k of ENV){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}globalThis.fetch=oldFetch;}
});
test('capsule ingress uses v4-compatible event and requires exact readback',async()=>{
 const previous=Object.fromEntries(ENV.map(k=>[k,process.env[k]]));const oldFetch=globalThis.fetch;
 try{
 process.env.MONDAYID_CAPSULE_INGEST_SECRET='test-secret';process.env.MONDAYID_WORLDLINE_URL='https://example.test';
 process.env.MONDAYID_WORLDLINE_WRITER_TOKEN='writer';process.env.MONDAYID_WORLDLINE_READ_TOKEN='reader';
 let written;let calls=0;
 globalThis.fetch=async(url,opts)=>{calls++;if(String(url).endsWith('/append')){
 written=JSON.parse(opts.body);return {ok:true,json:async()=>({ok:true,status:'INSERTED'})};}
 return {ok:true,json:async()=>({schema:'mondayid.worldline.event.v0.4.0',event:{...written,writerKeyId:'w_test'},conflicts:[]})};};
 const result=await run(capsule());assert.equal(result.statusCode,200);assert.equal(result.body.accepted,true);
 assert.equal(result.body.verification,'EXACT_EXTERNAL_READBACK');assert.equal(calls,2);
 assert.equal(written.predicate,'verified_external_effect');assert.equal(written.epistemicStatus,'VERIFIED');
 assert.equal(result.body.ack_signature.length,64);
 }finally{for(const k of ENV){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}globalThis.fetch=oldFetch;}
});
test('mismatched readback never returns ACK',async()=>{
 const previous=Object.fromEntries(ENV.map(k=>[k,process.env[k]]));const oldFetch=globalThis.fetch;
 try{
 process.env.MONDAYID_CAPSULE_INGEST_SECRET='test-secret';process.env.MONDAYID_WORLDLINE_URL='https://example.test';
 process.env.MONDAYID_WORLDLINE_WRITER_TOKEN='writer';process.env.MONDAYID_WORLDLINE_READ_TOKEN='reader';
 globalThis.fetch=async(url)=>String(url).endsWith('/append')?
 {ok:true,json:async()=>({ok:true,status:'INSERTED'})}:
 {ok:true,json:async()=>({schema:'mondayid.worldline.event.v0.4.0',event:{eventId:'wrong',writerKeyId:'w_test'},conflicts:[]})};
 const result=await run(capsule());assert.equal(result.statusCode,502);assert.equal(result.body.accepted,false);
 }finally{for(const k of ENV){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}globalThis.fetch=oldFetch;}
});
