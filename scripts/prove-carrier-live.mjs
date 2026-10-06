const endpoint=process.env.MONDAYID_MCP_URL || 'https://mondayid-host.vercel.app/api/mcp';

async function rpc(id,method,params={}){
  const response=await fetch(endpoint,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'accept':'application/json',
      'MCP-Protocol-Version':'2025-03-26'
    },
    body:JSON.stringify({jsonrpc:'2.0',id,method,params})
  });
  if(!response.ok) throw new Error(`MCP_HTTP_${response.status}`);
  const body=await response.json();
  if(body?.error) throw new Error(`MCP_RPC_${body.error.code}:${body.error.message}`);
  return body.result;
}

function structured(result){
  return result?.structuredContent ?? null;
}

const discovery=await fetch(endpoint,{headers:{accept:'application/json'}});
if(!discovery.ok) throw new Error(`MCP_DISCOVERY_HTTP_${discovery.status}`);
const info=await discovery.json();
const names=Array.isArray(info.tools)?info.tools:[];

let proof;
if(names.includes('cell_attach')){
  const result=await rpc(1,'tools/call',{name:'cell_attach',arguments:{limit:10,carrierVersion:'2.0.1'}});
  const value=structured(result);
  if(value?.ok!==true) throw new Error('LIVE_CELL_ATTACH_FAILED');
  if(!['ATTACHED','ATTACHED_DEGRADED'].includes(value?.state)) throw new Error('LIVE_CELL_ATTACH_STATE_INVALID');
  if(value?.canonical?.carrierPlugin!=='plugins_6ac400facbe481918f97d70c3b46e5e3') throw new Error('LIVE_CELL_ATTACH_CARRIER_MISMATCH');
  proof={
    ok:true,
    route:'cell_attach',
    endpoint,
    state:value.state,
    generation:value.identity?.generation ?? null,
    carrier:value.canonical?.carrierPlugin ?? null,
    worldlineTrust:value.worldline?.trust ?? null,
    unknowns:value.unknowns || []
  };
}else{
  const required=['health','capability_manifest','compile_history','get_state'];
  for(const name of required){
    if(!names.includes(name)) throw new Error(`LIVE_FALLBACK_TOOL_MISSING:${name}`);
  }
  const health=structured(await rpc(2,'tools/call',{name:'health',arguments:{}}));
  const manifest=structured(await rpc(3,'tools/call',{name:'capability_manifest',arguments:{}}));
  const history=structured(await rpc(4,'tools/call',{name:'compile_history',arguments:{}}));
  const state=structured(await rpc(5,'tools/call',{name:'get_state',arguments:{limit:10}}));
  if(health?.generation!==5) throw new Error('LIVE_HEALTH_NOT_GENERATION_5');
  if(manifest?.releaseState?.chatgpt_private_plugin!=='plugins_6ac400facbe481918f97d70c3b46e5e3') throw new Error('LIVE_MANIFEST_CARRIER_MISMATCH');
  if(history?.ok!==true) throw new Error('LIVE_HISTORY_COMPILE_FAILED');
  if(state?.ok!==true || state?.trust!=='trusted') throw new Error('LIVE_WORLDLINE_NOT_TRUSTED');
  if(state?.snapshot?.schema!=='mondayid.worldline.snapshot.v0.4.0') throw new Error('LIVE_WORLDLINE_SCHEMA_MISMATCH');
  proof={
    ok:true,
    route:'composite_fallback',
    endpoint,
    generation:health.generation,
    kernel:health.kernel,
    carrier:manifest.releaseState.chatgpt_private_plugin,
    releaseStatus:manifest.releaseState.status,
    historyCompiled:true,
    worldlineTrust:state.trust,
    worldlineSchema:state.snapshot.schema,
    generatedAtIso:state.snapshot.generatedAtIso || null,
    tools:names
  };
}
console.log(JSON.stringify(proof,null,2));
