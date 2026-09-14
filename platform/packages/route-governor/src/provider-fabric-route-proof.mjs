import assert from 'node:assert/strict';
import { electProviderRoute } from './provider-fabric-route.mjs';

const base = {
  capabilities: ['reasoning', 'vision'],
  health: { status: 'healthy', observed_at: '2026-09-14T15:00:00Z' },
  quota: { exhausted: false, remaining: 100 },
  privacy: { execution: 'cloud', region: 'IL' },
  cost: { estimated_usd: 0.02 },
  reliability: { acceptance_rate: 0.98 },
  latency: { p95_ms: 900 },
  verification: { readback: true },
};

const request = {
  id: 'provider-gate-proof-1',
  required_capabilities: ['reasoning', 'vision'],
  privacy: { allowed_regions: ['IL'] },
  max_cost_usd: 0.20,
  min_reliability: 0.90,
  max_latency_ms: 5000,
  requires_readback: true,
};

const providers = [
  { ...base, id: 'healthy-expensive', cost: { estimated_usd: 0.08 } },
  { ...base, id: 'healthy-cheap', cost: { estimated_usd: 0.01 }, reliability: { acceptance_rate: 0.96 } },
  { ...base, id: 'fallback-good', cost: { estimated_usd: 0.03 }, reliability: { acceptance_rate: 0.99 } },
  { ...base, id: 'wrong-region', privacy: { execution: 'cloud', region: 'US' } },
  { ...base, id: 'unhealthy', health: { status: 'down' } },
  { ...base, id: 'exhausted', quota: { exhausted: true, remaining: 0 } },
  { ...base, id: 'missing-vision', capabilities: ['reasoning'] },
  { ...base, id: 'unreliable', reliability: { acceptance_rate: 0.5 } },
  { ...base, id: 'no-readback', verification: { readback: false } },
];

const routed = electProviderRoute({ request, providers });
assert.equal(routed.status, 'routed');
assert.equal(routed.selected, 'healthy-cheap');
assert.deepEqual(routed.fallbacks.slice(0, 2), ['fallback-good', 'healthy-expensive']);
assert.equal(routed.receipt.selected_provider, 'healthy-cheap');
assert.deepEqual(routed.receipt.required_capabilities, ['reasoning', 'vision']);
assert.equal(routed.receipt.privacy.region, 'IL');
assert.ok(routed.rejected.find((x) => x.provider_id === 'wrong-region')?.blockers.includes('privacy:region:US'));
assert.ok(routed.rejected.find((x) => x.provider_id === 'unhealthy')?.blockers.includes('health:down'));
assert.ok(routed.rejected.find((x) => x.provider_id === 'exhausted')?.blockers.includes('quota:exhausted'));
assert.ok(routed.rejected.find((x) => x.provider_id === 'missing-vision')?.blockers.includes('missing capability:vision'));
assert.ok(routed.rejected.find((x) => x.provider_id === 'unreliable')?.blockers.includes('reliability:below-floor'));
assert.ok(routed.rejected.find((x) => x.provider_id === 'no-readback')?.blockers.includes('verification:no-readback'));

const localOnly = electProviderRoute({
  request: { ...request, id: 'provider-gate-proof-2', privacy: { local_only: true } },
  providers: [
    { ...base, id: 'cloud', cost: { estimated_usd: 0 } },
    { ...base, id: 'local', privacy: { execution: 'local', region: 'IL' }, cost: { estimated_usd: 0.05 } },
  ],
});
assert.equal(localOnly.selected, 'local');
assert.ok(localOnly.rejected.find((x) => x.provider_id === 'cloud')?.blockers.includes('privacy:local-only'));

const blocked = electProviderRoute({
  request,
  providers: providers.map((p) => ({ ...p, quota: { exhausted: true, remaining: 0 } })),
});
assert.equal(blocked.status, 'blocked');
assert.equal(blocked.reason, 'no_eligible_provider');
assert.equal(blocked.selected, null);

const missingContract = electProviderRoute({ request: { id: 'bad' }, providers });
assert.equal(missingContract.status, 'blocked');
assert.equal(missingContract.reason, 'required_capabilities_missing');

console.log('PROVIDER_FABRIC_GATE=PASS');
