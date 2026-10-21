import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import prmHandler from '../api/oauth/resource-metadata.mjs';
import asHandler from '../api/oauth/server-metadata.mjs';

const vercel=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const response=()=>({statusCode:null,headers:{},body:null,setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(x){this.body=x;return this;}});

test('standard OAuth metadata URL rewrites target nonhidden API handlers',()=>{
  const rewrites=new Map(vercel.rewrites.map(x=>[x.source,x.destination]));
  assert.equal(rewrites.get('/.well-known/oauth-protected-resource'),'/api/oauth/resource-metadata');
  assert.equal(rewrites.get('/.well-known/oauth-authorization-server'),'/api/oauth/server-metadata');
});

test('resource metadata is pinned to a single canonical HTTPS issuer',()=>{
  const out=response();
  prmHandler({method:'GET',headers:{'x-forwarded-host':'evil.example'}},out);
  assert.equal(out.statusCode,200);
  assert.equal(out.body.resource,'https://mondayid-host.vercel.app/api/mcp');
  assert.deepEqual(out.body.authorization_servers,['https://mondayid-host.vercel.app']);
  assert.equal(out.headers['Access-Control-Allow-Origin'],'*');
});

test('issuer metadata enforces PKCE S256 and never invokes a secret-dependent mint',()=>{
  const out=response();
  asHandler({method:'GET'},out);
  assert.equal(out.statusCode,200);
  assert.deepEqual(out.body.code_challenge_methods_supported,['S256']);
  assert.equal(out.body.token_endpoint,'https://mondayid-host.vercel.app/api/oauth/token');
});
