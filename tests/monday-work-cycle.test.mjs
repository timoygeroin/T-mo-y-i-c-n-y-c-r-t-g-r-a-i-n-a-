import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspectMondayDeployment } from '../scripts/monday-work-cycle.mjs';

const expected = [
  ['app.js', 'surfaces/02/app.js'],
  ['file-vault.js', 'surfaces/02/file-vault.js'],
  ['portable-capsule.js', 'surfaces/02/portable-capsule.js'],
  ['encrypted-capsule.js', 'surfaces/02/encrypted-capsule.js'],
  ['work-evidence.js', 'surfaces/02/work-evidence.js'],
];
const files = Object.fromEntries(expected.map(([publicName,path],i)=>[path,`// owned ${publicName} ${i}`]));
const fakeFetch = async (url)=>{
  const publicName = new URL(url).pathname.slice(1);
  const pair = expected.find(([name])=>name===publicName);
  if(!pair) return new Response('not found',{status:404});
  return new Response(files[pair[1]],{status:200});
};
const opts=(overrides={})=>({
  readLocal: async path=>{
    if(!(path in files))throw Error('absent '+path);
    return Buffer.from(files[path]);
  },
  fetchPublic:fakeFetch,
  baseUrl:'https://aloof-vr.miniup.app',
  checkedAt:'2026-10-22T18:00:00.000Z',
  localGate:'success',
  ...overrides
});

test('checks public assets byte-for-byte against canonical sources with real SHA-256',async()=>{
 const report=await inspectMondayDeployment(opts());
 assert.equal(report.schema,'monday.work-cycle.v1');
 assert.equal(report.status,'VERIFIED_PUBLIC_READBACK');
 assert.equal(report.checkedAt,'2026-10-22T18:00:00.000Z');
 assert.equal(report.localGate,'success');
 assert.deepEqual(report.checks.map(x=>x.asset),expected.map(x=>x[0]));
 assert.ok(report.checks.every(x=>x.status==='MATCH'));
 assert.equal(report.checks[0].expectedSha256,createHash('sha256').update(files['surfaces/02/app.js']).digest('hex'));
 assert.equal(report.checks[0].observedSha256,report.checks[0].expectedSha256);
});

test('a stale public app.js is not reported as verified or automatically deployed',async()=>{
 const report=await inspectMondayDeployment(opts({fetchPublic:async url=>{
   if(url.endsWith('/app.js'))return new Response('an outdated version',{status:200});
   return fakeFetch(url);
 }}));
 assert.equal(report.status,'BLOCKED');
 assert.equal(report.checks.find(x=>x.asset==='app.js').status,'CONTENT_DRIFT');
 assert.equal(report.action,'REVIEW_DEPLOYMENT');
 assert.ok(!JSON.stringify(report).includes('an outdated version'));
});

test('HTTP failure and unavailable network are not converted into success',async()=>{
 const report=await inspectMondayDeployment(opts({fetchPublic:async url=>{
   if(url.endsWith('/portable-capsule.js'))throw Error('private token should never be leaked');
   return new Response('',{status:503});
 }}));
 assert.equal(report.status,'BLOCKED');
 assert.equal(report.checks.length,expected.length);
 assert.ok(report.checks.some(x=>x.status==='UNREACHABLE'));
 assert.ok(report.checks.some(x=>x.status==='HTTP_ERROR'));
 assert.ok(!JSON.stringify(report).includes('private token'));
});

test('failed local gate must block even if deployed assets match',async()=>{
 const report=await inspectMondayDeployment(opts({localGate:'failure'}));
 assert.equal(report.status,'BLOCKED');
 assert.equal(report.action,'REVIEW_LOCAL_TESTS');
});

test('a public URL with user info, query or non-https is refused without requesting it',async()=>{
 let requests=0;
 for(const url of ['http://aloof-vr.miniup.app','https://me:pass@aloof-vr.miniup.app','https://aloof-vr.miniup.app/?token=X']){
  await assert.rejects(inspectMondayDeployment(opts({baseUrl:url,fetchPublic:async()=>{requests++;return new Response('') }})),/INVALID_PUBLIC_ORIGIN/);
 }
 assert.equal(requests,0);
});
