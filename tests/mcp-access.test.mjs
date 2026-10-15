import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeMcpTool, PRIVATE_MCP_TOOLS } from '../src/mcp-access.mjs';

for (const name of PRIVATE_MCP_TOOLS) {
  test(`${name}: deny when secret missing, even with a bearer header`, () => {
    assert.equal(authorizeMcpTool(name, {headers:{authorization:'Bearer anything'}}, {}), false);
  });
  test(`${name}: deny anonymous or incorrectly authenticated clients`, () => {
    const env={MONDAYID_HOST_TOKEN:'real-secret'};
    for (const headers of [{}, {authorization:'Bearer fake'}, {authorization:'Basic real-secret'}, {authorization:'Bearer real-secret '}, {authorization:'Bearer real-secre'}]) {
      assert.equal(authorizeMcpTool(name, {headers}, env), false);
    }
    assert.equal(authorizeMcpTool(name, {headers:{authorization:'Bearer real-secret'}}, env), true);
    assert.equal(authorizeMcpTool(name, {headers:{Authorization:'Bearer real-secret'}}, env), true);
  });
}

test('non-private introspection remains available without a token', () => {
  for (const name of ['health','visual_release_gate','capability_manifest','compile_history']) {
    assert.equal(authorizeMcpTool(name, {}, {}), true);
  }
});

test('default deny: unknown or typo tool names are private (BUS-REVIEW-03)', () => {
  for (const name of ['bus_pots','new_tool','','get_State']) {
    assert.equal(authorizeMcpTool(name, {}, {}), false, name);
    assert.equal(authorizeMcpTool(name, {headers:{authorization:'Bearer x'}}, {MONDAYID_HOST_TOKEN:'y'}), false, name);
  }
});

test('per-host tokens bind a principal; shared token is not host-bound (BUS-REVIEW-04)', async () => {
  const { resolvePrincipal } = await import('../src/mcp-access.mjs');
  const env = { MONDAYID_HOST_TOKEN:'shared-secret', MONDAYID_BUS_HOST_TOKENS:JSON.stringify({'grok-monday':'g'.repeat(32),'chatgpt-monday':'c'.repeat(32)}) };
  assert.deepEqual(resolvePrincipal({headers:{authorization:'Bearer '+'g'.repeat(32)}}, env), {principal:'grok-monday',hostBound:true});
  assert.deepEqual(resolvePrincipal({headers:{authorization:'Bearer shared-secret'}}, env), {principal:'shared',hostBound:false});
  assert.equal(resolvePrincipal({headers:{authorization:'Bearer nope'}}, env), null);
  assert.equal(resolvePrincipal({headers:{authorization:'Bearer short'}}, {MONDAYID_BUS_HOST_TOKENS:JSON.stringify({h:'short'})}), null);
  const token='a'.repeat(32);
  assert.equal(resolvePrincipal({headers:{authorization:'Bearer '+token}}, {MONDAYID_BUS_HOST_TOKENS:'true'}), null);
  assert.equal(resolvePrincipal({headers:{authorization:'Bearer '+token}}, {MONDAYID_BUS_HOST_TOKENS:'{'}), null);
  assert.equal(resolvePrincipal({headers:{authorization:'Bearer '+token}}, {MONDAYID_BUS_HOST_TOKENS:JSON.stringify({'../grok':token,'Bad Host':token})}), null);
  assert.deepEqual(resolvePrincipal({headers:{authorization:'Bearer shared-secret'}}, {MONDAYID_HOST_TOKEN:'shared-secret', MONDAYID_BUS_HOST_TOKENS:'true'}), {principal:'shared', hostBound:false});
});
