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
    assert.equal(authorizeMcpTool(name, {headers:{authorization:'Bearer real-secret'}}, env), !['bus_post','bus_ack'].includes(name));
    assert.equal(authorizeMcpTool(name, {headers:{Authorization:'Bearer real-secret'}}, env), !['bus_post','bus_ack'].includes(name));
  });
  test(`${name}: accept the existing writer credential when no dedicated host token exists`, () => {
    const env={MONDAYID_WORLDLINE_WRITER_TOKEN:'writer-secret'};
    assert.equal(authorizeMcpTool(name, {headers:{authorization:'Bearer writer-secret'}}, env), !['bus_post','bus_ack'].includes(name));
    assert.equal(authorizeMcpTool(name, {headers:{authorization:'Bearer wrong'}}, env), false);
  });
  test(`${name}: dedicated host token takes precedence over the writer credential`, () => {
    const env={
      MONDAYID_HOST_TOKEN:'host-secret',
      MONDAYID_WORLDLINE_WRITER_TOKEN:'writer-secret'
    };
    assert.equal(authorizeMcpTool(name, {headers:{authorization:'Bearer host-secret'}}, env), !['bus_post','bus_ack'].includes(name));
    assert.equal(authorizeMcpTool(name, {headers:{authorization:'Bearer writer-secret'}}, env), false);
  });
}

test('non-private introspection remains available without a token', () => {
  for (const name of ['health','visual_release_gate','capability_manifest','compile_history']) {
    assert.equal(authorizeMcpTool(name, {}, {}), true);
  }
});

test('candidate writes demand a bound host principal while shared readers remain compatible',async()=>{
  const {resolvePrincipal}=await import('../src/mcp-access.mjs');
  const token='h'.repeat(32);
  const env={MONDAYID_HOST_TOKEN:'shared-secret',MONDAYID_BUS_HOST_TOKENS:JSON.stringify({'chatgpt-monday':token})};
  const bound={headers:{authorization:'Bearer '+token}};
  const legacy={headers:{authorization:'Bearer shared-secret'}};
  assert.deepEqual(resolvePrincipal(bound,env),{principal:'chatgpt-monday',hostBound:true});
  assert.equal(authorizeMcpTool('bus_post',bound,env),true);
  assert.equal(authorizeMcpTool('bus_ack',bound,env),true);
  assert.equal(authorizeMcpTool('bus_post',legacy,env),false);
  assert.equal(authorizeMcpTool('bus_ack',legacy,env),false);
  assert.equal(authorizeMcpTool('bus_list',legacy,env),true);
  assert.equal(authorizeMcpTool('future_private_tool',{},env),false);
});
