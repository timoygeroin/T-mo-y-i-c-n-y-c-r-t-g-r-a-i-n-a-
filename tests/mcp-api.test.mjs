import test from 'node:test';
import assert from 'node:assert/strict';
import mcpHandler from '../api/mcp.mjs';

function response(){
  const headers={};
  return {
    statusCode:null,
    body:null,
    ended:false,
    setHeader(k,v){headers[k]=v;},
    status(code){this.statusCode=code; return this;},
    json(value){this.body=value; return this;},
    end(){this.ended=true; return this;},
    headers
  };
}

test('MCP initialize returns protocol and server info',async()=>{
  const req={method:'POST',body:{jsonrpc:'2.0',id:1,method:'initialize',params:{}}};
  const res=response();
  await mcpHandler(req,res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.jsonrpc,'2.0');
  assert.equal(res.body.id,1);
  assert.equal(res.body.result.serverInfo.name,'monday-work');
  assert.equal(res.body.result.protocolVersion,'2025-03-26');
});

test('MCP tools/list exposes health capability_manifest and get_state',async()=>{
  const req={method:'POST',body:{jsonrpc:'2.0',id:2,method:'tools/list',params:{}}};
  const res=response();
  await mcpHandler(req,res);
  assert.equal(res.statusCode,200);
  const names=res.body.result.tools.map(tool=>tool.name);
  assert.deepEqual(names,['health','capability_manifest','get_state']);
});

test('MCP tools/call health returns structured host readback',async()=>{
  const req={method:'POST',body:{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'health',arguments:{}}}};
  const res=response();
  await mcpHandler(req,res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.result.structuredContent.ok,true);
  assert.equal(res.body.result.structuredContent.generation,5);
});

test('MCP GET provides transport discovery without claiming external verification',async()=>{
  const req={method:'GET'};
  const res=response();
  await mcpHandler(req,res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.transport,'streamable-http');
  assert.ok(res.body.tools.includes('get_state'));
});


test('MCP capability_manifest exposes canonical release seal',async()=>{
  const req={method:'POST',body:{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'capability_manifest',arguments:{}}}};
  const res=response();
  await mcpHandler(req,res);
  assert.equal(res.statusCode,200);
  const manifest=res.body.result.structuredContent;
  assert.equal(manifest.releaseState.status,'INTERNAL_FINISH_PASS_EXTERNAL_GATES_REMAIN');
  assert.equal(manifest.releaseState.seal,'ops/final-seal-20261004.json');
  assert.ok(manifest.metaInvariants.includes('platform_mode_is_not_capability_owner'));
});
