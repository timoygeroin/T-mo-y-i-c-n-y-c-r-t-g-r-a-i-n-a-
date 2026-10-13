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
