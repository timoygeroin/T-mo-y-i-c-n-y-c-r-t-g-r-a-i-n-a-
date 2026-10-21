import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mintAuthorizationCode, exchangeAuthorizationCode, verifyAccessToken,
  s256Challenge, ownerApprovalAccepted, protectedResourceMetadata,
  authorizationServerMetadata, oauthConfigured
} from '../src/oauth-as.mjs';
import authorizeHandler from '../api/oauth/authorize.mjs';
import { authorizeMcpTool, resolvePrincipal } from '../src/mcp-access.mjs';

const SECRET='s'.repeat(48), APPROVAL='p'.repeat(48);
const env={MONDAYID_OAUTH_ISSUER_SECRET:SECRET,MONDAYID_OAUTH_OWNER_APPROVAL_SECRET:APPROVAL,MONDAYID_PUBLIC_ORIGIN:'https://mondayid-host.vercel.app',MONDAYID_WORLDLINE_URL:'https://worldline.test',MONDAYID_WORLDLINE_WRITER_TOKEN:'writer-secret'};
const verifier='v'.repeat(64);
const mint=(config=env)=>mintAuthorizationCode({env:config,clientId:'chatgpt-connector',redirectUri:'https://chatgpt.com/connector/oauth/callback',codeChallenge:s256Challenge(verifier)});

function worldline(){
  const events=new Map();
  const fetchImpl=async(url,opts={})=>{
    const u=new URL(url);
    if(u.pathname==='/worldline/v4/append'){
      const e=JSON.parse(opts.body);
      if(events.has(e.eventId)) return {ok:true,status:200,json:async()=>({ok:true,status:'DUPLICATE'})};
      events.set(e.eventId,e);
      return {ok:true,status:201,json:async()=>({ok:true,status:'INSERTED'})};
    }
    if(u.pathname==='/worldline/v4/event'){
      const e=events.get(u.searchParams.get('eventId'));
      return {ok:!!e,status:e?200:404,json:async()=>({schema:'mondayid.worldline.event.v0.4.0',event:e??null,conflicts:[]})};
    }
    return {ok:false,status:404,json:async()=>({})};
  };
  return {fetchImpl,events};
}
const redeem=(code,fetchImpl,config=env)=>exchangeAuthorizationCode({env:config,code,clientId:'chatgpt-connector',redirectUri:'https://chatgpt.com/connector/oauth/callback',codeVerifier:verifier,fetchImpl});

function response(){
  return {statusCode:200,headers:{},body:null,ended:false,setHeader(k,v){this.headers[k]=v;return this;},status(c){this.statusCode=c;return this;},json(b){this.body=b;return this;},end(body){this.ended=true;this.body=body??this.body;return this;}};
}
async function withEnv(values, fn){
  const old=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));
  Object.assign(process.env,values);
  try{return await fn();}
  finally{for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;}
}

test('OAuth metadata uses pinned HTTPS origin and existing MCP resource',()=>{
  assert.equal(oauthConfigured(env),true);
  assert.equal(protectedResourceMetadata(env).resource,'https://mondayid-host.vercel.app/api/mcp');
  assert.deepEqual(authorizationServerMetadata(env).code_challenge_methods_supported,['S256']);
  assert.equal(protectedResourceMetadata({}, {headers:{'x-forwarded-host':'evil.invalid'}}).resource,'https://mondayid-host.vercel.app/api/mcp');
});

test('owner approval secret is required, unrelated bearer cannot approve',()=>{
  assert.equal(ownerApprovalAccepted(APPROVAL,env),true);
  assert.equal(ownerApprovalAccepted('wrong',env),false);
  assert.equal(ownerApprovalAccepted(APPROVAL,{}),false);
});

test('real PKCE exchange consumes code durably once and yields audience-scoped bearer',async()=>{
  const {fetchImpl,events}=worldline();
  const code=mint().code;
  const first=await redeem(code,fetchImpl);
  assert.equal(first.ok,true);
  assert.equal(events.size,1);
  assert.deepEqual(resolvePrincipal({headers:{authorization:'Bearer '+first.token.access_token}},env).principal,'chatgpt-monday');
  assert.equal(authorizeMcpTool('bus_post',{headers:{authorization:'Bearer '+first.token.access_token}},env),true);
  assert.equal(verifyAccessToken(first.token.access_token,{...env,MONDAYID_PUBLIC_ORIGIN:'https://other.test'}),null);
  const second=await redeem(code,fetchImpl);
  assert.equal(second.ok,false);
  assert.equal(second.error,'invalid_grant');
  assert.equal(events.size,1);
});

test('invalid PKCE and missing durable writer never release a bearer',async()=>{
  const code=mint().code;
  const {fetchImpl}=worldline();
  const bad=await exchangeAuthorizationCode({env,code,clientId:'chatgpt-connector',redirectUri:'https://chatgpt.com/connector/oauth/callback',codeVerifier:'x'.repeat(64),fetchImpl});
  assert.equal(bad.ok,false);
  assert.equal((await redeem(code,fetchImpl,{...env,MONDAYID_WORLDLINE_WRITER_TOKEN:undefined})).ok,false);
  assert.equal(mint({...env,MONDAYID_OAUTH_ISSUER_SECRET:undefined}).ok,false);
  assert.equal(mintAuthorizationCode({env,clientId:'chatgpt-connector',redirectUri:'https://evil.test/callback',codeChallenge:s256Challenge(verifier)}).ok,false);
  assert.equal(mintAuthorizationCode({env,clientId:'chatgpt-connector',redirectUri:'https://chatgpt.com/connector/oauth/callback',codeChallenge:s256Challenge(verifier),scope:'admin'}).ok,false);
});

test('authorization endpoint never treats GET query or bare POST as consent',async()=>{
  await withEnv(env,async()=>{
    const req={method:'GET',url:'/api/oauth/authorize?'+new URLSearchParams({consent:'1',client_id:'chatgpt-connector',redirect_uri:'https://chatgpt.com/connector/oauth/callback',code_challenge:s256Challenge(verifier)}).toString(),headers:{host:'mondayid-host.vercel.app'}};
    const get=response();await authorizeHandler(req,get);
    assert.equal(get.statusCode,200);
    assert.ok(String(get.body).includes('owner_approval'));
    const unauthorized=response();
    await authorizeHandler({method:'POST',url:'/api/oauth/authorize',body:{consent:'1',client_id:'chatgpt-connector',redirect_uri:'https://chatgpt.com/connector/oauth/callback',code_challenge:s256Challenge(verifier)}},unauthorized);
    assert.equal(unauthorized.statusCode,403);
    assert.equal(unauthorized.headers.Location,undefined);
    const granted=response();
    const body=new URLSearchParams({consent:'1',owner_approval:APPROVAL,client_id:'chatgpt-connector',redirect_uri:'https://chatgpt.com/connector/oauth/callback',code_challenge:s256Challenge(verifier),code_challenge_method:'S256'});
    await authorizeHandler({method:'POST',url:'/api/oauth/authorize',body:body.toString()},granted);
    assert.equal(granted.statusCode,302);
    assert.ok(granted.headers.Location.startsWith('https://chatgpt.com/connector/oauth/callback?code='));
  });
});
