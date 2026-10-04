import test from 'node:test';
import assert from 'node:assert/strict';
import * as physiology from '../src/physiology-field.mjs';
import * as policy from '../src/policy-field.mjs';
import { MondayRuntime } from '../src/runtime.mjs';

test('authority membrane issues a short-lived action-bound lease without exposing the root key', () => {
  assert.equal(typeof policy.createAuthorityMembrane,'function');
  const membrane=policy.createAuthorityMembrane({
    rootKey:'root-secret',
    now:()=>1_000
  });
  const lease=membrane.issue({
    cellId:'cell:chatgpt',
    domain:'continuity',
    effect:'append_verified_delta',
    ttlMs:500
  });
  assert.equal(lease.ok,true);
  assert.equal(lease.lease.cellId,'cell:chatgpt');
  assert.equal(lease.lease.domain,'continuity');
  assert.equal(lease.lease.effect,'append_verified_delta');
  assert.equal(lease.lease.expiresAt,1500);
  assert.equal(JSON.stringify(lease).includes('root-secret'),false);
  assert.equal(membrane.authorize({
    lease:lease.lease,
    cellId:'cell:chatgpt',
    domain:'continuity',
    effect:'append_verified_delta'
  }).ok,true);
});

test('authority membrane rejects scope drift, expiry and lease replay', () => {
  assert.equal(typeof policy.createAuthorityMembrane,'function');
  let time=2_000;
  const membrane=policy.createAuthorityMembrane({
    rootKey:'root-secret',
    now:()=>time
  });
  const issued=membrane.issue({
    cellId:'cell:a',
    domain:'deploy',
    effect:'promote',
    ttlMs:100
  });
  assert.equal(membrane.authorize({
    lease:issued.lease,
    cellId:'cell:a',
    domain:'deploy',
    effect:'delete-project'
  }).code,'LEASE_SCOPE_MISMATCH');
  const first=membrane.consume({
    lease:issued.lease,
    cellId:'cell:a',
    domain:'deploy',
    effect:'promote'
  });
  assert.equal(first.ok,true);
  assert.equal(membrane.consume({
    lease:issued.lease,
    cellId:'cell:a',
    domain:'deploy',
    effect:'promote'
  }).code,'LEASE_ALREADY_CONSUMED');

  const expiring=membrane.issue({
    cellId:'cell:b',
    domain:'continuity',
    effect:'write',
    ttlMs:10
  });
  time=2_011;
  assert.equal(membrane.authorize({
    lease:expiring.lease,
    cellId:'cell:b',
    domain:'continuity',
    effect:'write'
  }).code,'LEASE_EXPIRED');
});

test('metabolism conserves compute and routes around an exhausted host without losing task identity', () => {
  assert.equal(typeof physiology.allocateMetabolism,'function');
  const out=physiology.allocateMetabolism({
    desiredEffect:'deploy_verified_runtime',
    regulation:{mode:'EXPLORE',computeFloor:'HIGH',verificationStrictness:'NORMAL'},
    hosts:[
      {
        id:'vercel',
        capabilities:['deploy_verified_runtime'],
        health:'HEALTHY',
        available:true,
        quotaRemaining:0,
        auth:'AVAILABLE',
        cost:1,
        latency:1,
        reliability:0.99
      },
      {
        id:'replit',
        capabilities:['deploy_verified_runtime'],
        health:'HEALTHY',
        available:true,
        quotaRemaining:5,
        auth:'AVAILABLE',
        cost:2,
        latency:2,
        reliability:0.95
      }
    ],
    task:{id:'task:deploy',priority:90}
  });
  assert.equal(out.schema,'mondayid.metabolism.v1');
  assert.equal(out.taskId,'task:deploy');
  assert.equal(out.selectedHost,'replit');
  assert.ok(out.rejected.some(x=>x.id==='vercel' && x.reason==='QUOTA_EXHAUSTED'));
  assert.ok(['HIGH','MAX'].includes(out.computeTier));
  assert.equal(out.preserveTaskIdentity,true);
});

test('host homeostasis returns a precise preserved blocker when every host is unavailable', () => {
  assert.equal(typeof physiology.allocateMetabolism,'function');
  const out=physiology.allocateMetabolism({
    desiredEffect:'trusted_write',
    regulation:{mode:'RECOVER',computeFloor:'HIGH',verificationStrictness:'STRICT'},
    hosts:[
      {id:'vercel',capabilities:['trusted_write'],health:'HEALTHY',available:true,quotaRemaining:10,auth:'MISSING',cost:1,latency:1,reliability:0.99},
      {id:'replit',capabilities:['trusted_write'],health:'UNHEALTHY',available:true,quotaRemaining:10,auth:'AVAILABLE',cost:1,latency:1,reliability:0.9}
    ],
    task:{id:'task:write',priority:100}
  });
  assert.equal(out.selectedHost,null);
  assert.equal(out.state,'BLOCKED_PRESERVED');
  assert.equal(out.taskId,'task:write');
  assert.equal(out.preserveTaskIdentity,true);
  assert.deepEqual(out.rejected.map(x=>x.reason).sort(),['AUTHORITY_UNAVAILABLE','HOST_UNHEALTHY']);
});


test('runtime exposes metabolic host routing instead of binding task identity to one provider', () => {
  const runtime=new MondayRuntime({
    hostPool:[
      {id:'vercel',capabilities:['deploy'],health:'HEALTHY',available:true,quotaRemaining:0,auth:'AVAILABLE',cost:1,latency:1,reliability:0.99},
      {id:'replit',capabilities:['deploy'],health:'HEALTHY',available:true,quotaRemaining:3,auth:'AVAILABLE',cost:2,latency:2,reliability:0.95}
    ]
  });
  assert.equal(typeof runtime.routeHost,'function');
  const routed=runtime.routeHost({
    desiredEffect:'deploy',
    task:{id:'task:runtime-route'},
    regulation:{mode:'EXPLORE',computeFloor:'HIGH',verificationStrictness:'NORMAL'}
  });
  assert.equal(routed.selectedHost,'replit');
  assert.equal(routed.taskId,'task:runtime-route');
  assert.equal(routed.preserveTaskIdentity,true);
});
