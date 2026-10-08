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

test('MCP tools/list exposes read tools plus bounded trusted write proof',async()=>{
  const req={method:'POST',body:{jsonrpc:'2.0',id:2,method:'tools/list',params:{}}};
  const res=response();
  await mcpHandler(req,res);
  assert.equal(res.statusCode,200);
  const names=res.body.result.tools.map(tool=>tool.name);
  assert.deepEqual(names,[
    'visual_release_gate',
    'health',
    'cell_attach',
    'capability_manifest',
    'compile_history',
    'get_state',
    'prove_trusted_write_readback'
  ]);
});

test('MCP cell_attach returns one canonical attach snapshot with trusted Worldline',async()=>{
  const previousUrl=process.env.MONDAYID_WORLDLINE_URL;
  const previousFetch=globalThis.fetch;
  process.env.MONDAYID_WORLDLINE_URL='https://worldline.example.test';
  globalThis.fetch=async()=>({
    ok:true,
    status:200,
    json:async()=>({
      schema:'mondayid.worldline.snapshot.v0.4.0',
      trust:'AUTHENTICATED_MACHINE_WRITER',
      readOnly:true,
      generatedAtIso:'2026-10-06T10:00:00Z',
      events:[]
    })
  });
  try{
    const req={method:'POST',body:{jsonrpc:'2.0',id:22,method:'tools/call',params:{name:'cell_attach',arguments:{limit:20,carrierVersion:'2.0.1'}}}};
    const res=response();
    await mcpHandler(req,res);
    assert.equal(res.statusCode,200);
    const value=res.body.result.structuredContent;
    assert.equal(value.ok,true);
    assert.equal(value.state,'ATTACHED');
    assert.equal(value.schema,'mondayid.chatgpt-carrier-attach.v1');
    assert.equal(value.canonical.carrierPlugin,'plugins_6ac400facbe481918f97d70c3b46e5e3');
    assert.equal(value.worldline.schema,'mondayid.worldline.snapshot.v0.4.0');
    assert.equal(value.next.operation,'RECONCILE_CURRENT_SIGNAL_THEN_RESUME');
  } finally {
    if(previousUrl===undefined) delete process.env.MONDAYID_WORLDLINE_URL;
    else process.env.MONDAYID_WORLDLINE_URL=previousUrl;
    globalThis.fetch=previousFetch;
  }
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
  assert.ok(res.body.tools.includes('cell_attach'));
  assert.ok(res.body.tools.includes('get_state'));
  assert.ok(res.body.tools.includes('prove_trusted_write_readback'));
});

test('MCP capability_manifest exposes canonical release seal',async()=>{
  const req={method:'POST',body:{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'capability_manifest',arguments:{}}}};
  const res=response();
  await mcpHandler(req,res);
  assert.equal(res.statusCode,200);
  const manifest=res.body.result.structuredContent;
  assert.equal(manifest.releaseState.status,'CANONICAL_SURFACE_CONVERGENCE');
  assert.equal(manifest.releaseState.seal,'ops/final-seal-20261004.json');
  assert.equal(manifest.releaseState.canonical_user_surface.host,'ChatGPT iPhone');
  assert.equal(manifest.releaseState.canonical_user_surface.display_name,'MondayID');
  assert.ok(manifest.metaInvariants.includes('platform_mode_is_not_capability_owner'));
  assert.equal(manifest.physiology.schema,'mondayid.physiology-contract.v1');
  assert.equal(manifest.physiology.identity_owner,false);
  assert.equal(manifest.organismPhysics.schema,'mondayid.organism-physics.v1');
  assert.equal(manifest.organismSynapse.schema,'mondayid.organism-synapse.v1');
  assert.equal(manifest.reentryAndResponse.schema,'mondayid.reentry-response-law.v1');
  assert.equal(manifest.visualPhenotype.schema,'mondayid.visual-phenotype-contract.v1');
  assert.equal(manifest.visualPhenotype.route_governor.attached_image_alone_authorizes_render,false);
  assert.equal(manifest.authorityMembrane.schema,'mondayid.authority-membrane-contract.v1');
  assert.equal(manifest.metabolism.schema,'mondayid.metabolism-contract.v1');
  assert.equal(manifest.hostHomeostasis.schema,'mondayid.host-homeostasis.v1');
});

test('MCP compile_history collapses project shells into active capability state',async()=>{
  const req={method:'POST',body:{jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'compile_history',arguments:{}}}};
  const res=response();
  await mcpHandler(req,res);
  assert.equal(res.statusCode,200);
  const value=res.body.result.structuredContent;
  assert.equal(value.ok,true);
  assert.equal(value.compiled.projectRuntimeAuthority,false);
  assert.equal(value.compiled.invalid.length,0);
  assert.ok(value.compiled.activeOrgans.some(x=>x.organ==='MONDAY_WORK'));
  assert.ok(value.compiled.activeRoles.some(x=>x.role==='JARVIS'));
  assert.ok(value.delta.activeOrgans.includes('capability_foundry'));
});

test('MCP bounded trusted write proof persists then exact-readbacks one deterministic effect',async()=>{
  const previousUrl=process.env.MONDAYID_WORLDLINE_URL;
  const previousToken=process.env.MONDAYID_WORLDLINE_WRITER_TOKEN;
  const previousFetch=globalThis.fetch;
  const calls=[];
  process.env.MONDAYID_WORLDLINE_URL='https://worldline.example.test';
  process.env.MONDAYID_WORLDLINE_WRITER_TOKEN='writer-secret';
  globalThis.fetch=async(url,init)=>{
    calls.push({url:String(url),init});
    if(init?.method==='POST'){
      const event=JSON.parse(init.body);
      return {
        ok:true,
        status:201,
        json:async()=>({
          ok:true,
          schema:'mondayid.worldline.write-receipt.v0.4.0',
          status:'INSERTED',
          event:{...event,writerKeyId:'test-key'}
        })
      };
    }
    const written=JSON.parse(calls[0].init.body);
    return {
      ok:true,
      status:200,
      json:async()=>({
        schema:'mondayid.worldline.event.v0.4.0',
        event:{...written,writerKeyId:'test-key'},
        conflicts:[]
      })
    };
  };

  try{
    const req={method:'POST',body:{jsonrpc:'2.0',id:6,method:'tools/call',params:{name:'prove_trusted_write_readback',arguments:{}}}};
    const res=response();
    await mcpHandler(req,res);
    assert.equal(res.statusCode,200);
    const value=res.body.result.structuredContent;
    assert.equal(value.ok,true);
    assert.equal(value.writeStatus,'INSERTED');
    assert.equal(value.verification.ok,true);
    assert.equal(value.verification.mode,'external-exact-readback');
    assert.equal(calls.length,2);
    assert.match(calls[0].init.headers.authorization,/^Bearer /);
    assert.equal(JSON.stringify(calls).includes('writer-secret'),true);
    assert.equal(JSON.stringify(value).includes('writer-secret'),false);
  } finally {
    if(previousUrl===undefined) delete process.env.MONDAYID_WORLDLINE_URL;
    else process.env.MONDAYID_WORLDLINE_URL=previousUrl;
    if(previousToken===undefined) delete process.env.MONDAYID_WORLDLINE_WRITER_TOKEN;
    else process.env.MONDAYID_WORLDLINE_WRITER_TOKEN=previousToken;
    globalThis.fetch=previousFetch;
  }
});

test('MCP visual_release_gate blocks a render without approved identity bytes',async()=>{
 const req={method:'POST',body:{jsonrpc:'2.0',id:66,method:'tools/call',params:{name:'visual_release_gate',arguments:{
  renderRequested:true,scene:{assetId:'terrace',role:'scene',preserveGeometry:true},
  identity:{role:'identity',approved:false,bytesAvailable:false},
  wardrobe:{requested:'black-square-neck',selected:'black-square-neck'}
 }}}};
 const res=response();
 await mcpHandler(req,res);
 assert.equal(res.statusCode,200);
 assert.equal(res.body.result.structuredContent.status,'HOLD');
 assert.equal(res.body.result.structuredContent.code,'IDENTITY_ANCHOR_REQUIRED');
});
