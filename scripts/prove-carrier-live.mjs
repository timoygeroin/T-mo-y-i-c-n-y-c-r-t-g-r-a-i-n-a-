// Verifies ONLY public Monday Host identity and the private-tool authorization boundary.
// A private cell_attach requires a credential and is not evidence of live continuity in CI.
const endpoint=process.env.MONDAYID_MCP_URL || 'https://mondayid-host.vercel.app/api/mcp';
async function rpc(id,method,params={}){
 const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','accept':'application/json','MCP-Protocol-Version':'2025-03-26'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
 if(!response.ok) throw new Error('MCP_HTTP_'+response.status);
 return response.json();
}
const discovery=await fetch(endpoint,{headers:{accept:'application/json'}});
if(!discovery.ok) throw new Error('MCP_DISCOVERY_HTTP_'+discovery.status);
const info=await discovery.json();
const names=Array.isArray(info.tools)?info.tools:[];
for(const tool of ['health','capability_manifest','compile_history','get_state','cell_attach','bus_post','bus_list','bus_get','bus_ack']){
 if(!names.includes(tool))throw new Error('REQUIRED_TOOL_MISSING:'+tool);
}
const healthy=await rpc(1,'tools/call',{name:'health',arguments:{}});
const identity=healthy?.result?.structuredContent;
if(identity?.ok!==true || identity?.generation!==5)throw new Error('MONDAY_HOST_HEALTH_FAILED');
const manifest=await rpc(2,'tools/call',{name:'capability_manifest',arguments:{}});
const owner=manifest?.result?.structuredContent?.releaseState?.chatgpt_private_plugin;
if(owner!=='plugins_6ac400facbe481918f97d70c3b46e5e3')throw new Error('MONDAY_IDENTITY_MISMATCH');
for(const tool of ['cell_attach','get_state','prove_trusted_write_readback','bus_post','bus_list','bus_get','bus_ack']){
 const result=await rpc(3,'tools/call',{name:tool,arguments:{}});
 if(result?.error?.code!==-32001 || result?.error?.message!=='PRIVATE_TOOL_AUTH_REQUIRED')throw new Error('PRIVATE_MCP_TOOL_EXPOSED:'+tool);
}

const origin=new URL(endpoint).origin;
const prmResponse=await fetch(origin+'/.well-known/oauth-protected-resource',{headers:{accept:'application/json'}});
if(!prmResponse.ok)throw new Error('OAUTH_PRM_HTTP_'+prmResponse.status);
const prm=await prmResponse.json();
if(prm.resource!==origin+'/api/mcp' || !Array.isArray(prm.authorization_servers) || !prm.authorization_servers.includes(origin))
 throw new Error('OAUTH_PRM_RESOURCE_MISMATCH');
const asResponse=await fetch(origin+'/.well-known/oauth-authorization-server',{headers:{accept:'application/json'}});
if(!asResponse.ok)throw new Error('OAUTH_AS_HTTP_'+asResponse.status);
const as=await asResponse.json();
if(as.issuer!==origin || !as.code_challenge_methods_supported?.includes('S256'))
 throw new Error('OAUTH_ISSUER_OR_PKCE_MISMATCH');
const consentResponse=await fetch(origin+'/api/oauth/authorize',{
 method:'POST',
 headers:{'content-type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({consent:'1',client_id:'unapproved-ci-client',redirect_uri:'https://chatgpt.com/connector/oauth/callback',code_challenge:'x'.repeat(43),code_challenge_method:'S256'}),
 redirect:'manual'
});
if(![403,503].includes(consentResponse.status) || consentResponse.headers.get('location'))
 throw new Error('OWNER_APPROVAL_BYPASS_STATUS_'+consentResponse.status);
console.log(JSON.stringify({ok:true,generation:identity.generation,carrier:owner,privateToolsDenied:7,oauthMetadataVerified:true,ownerConsentBypassDenied:true,scope:'PUBLIC_IDENTITY_AND_DENIAL_ONLY',privateWorldlineContinuity:'NOT_TESTED'}));
