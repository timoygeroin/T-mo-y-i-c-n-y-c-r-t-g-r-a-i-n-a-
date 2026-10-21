// Production-only, uncredentialed OAuth discovery and consent-denial probe.
// Does not submit approval credentials or cause access token issuance.
const origin='https://mondayid-host.vercel.app';
async function getJson(path){
  const r=await fetch(origin+path,{headers:{accept:'application/json'}});
  if(!r.ok)throw new Error('HTTP_'+r.status+'_'+path);
  return r.json();
}
const health=await getJson('/api/health');
if(health.generation!==5 || !/^[a-f0-9]{40}$/.test(String(health.sourceRevision||'')))
  throw new Error('PRODUCTION_SOURCE_IDENTITY_UNVERIFIED');
const prm=await getJson('/.well-known/oauth-protected-resource');
if(prm.resource!==origin+'/api/mcp' || !prm.authorization_servers?.includes(origin))
  throw new Error('OAUTH_PUBLIC_RESOURCE_MISMATCH');
const as=await getJson('/.well-known/oauth-authorization-server');
if(as.issuer!==origin || !as.code_challenge_methods_supported?.includes('S256') || as.token_endpoint!==origin+'/api/oauth/token')
  throw new Error('OAUTH_PUBLIC_ISSUER_MISMATCH');
const unauthorized=await fetch(origin+'/api/oauth/authorize',{
  method:'POST',redirect:'manual',
  headers:{'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({consent:'1',client_id:'unapproved-public-probe',redirect_uri:'https://chatgpt.com/connector/oauth/callback',code_challenge:'x'.repeat(43),code_challenge_method:'S256'})
});
if(unauthorized.status!==403 || unauthorized.headers.get('location'))
  throw new Error('OAUTH_OWNER_GATE_NOT_ACTIVE_'+unauthorized.status);
const getConsent=await fetch(origin+'/api/oauth/authorize?'+new URLSearchParams({
  response_type:'code',client_id:'owner-approval-availability-test',
  redirect_uri:'https://chatgpt.com/connector/oauth/callback',
  code_challenge:'x'.repeat(43),code_challenge_method:'S256'
}),{headers:{accept:'text/html'},redirect:'manual'});
const consentPage=await getConsent.text();
if(getConsent.status!==200 || !consentPage.includes('name="owner_approval"') || getConsent.headers.get('location'))
  throw new Error('OWNER_CONSENT_FORM_UNAVAILABLE_'+getConsent.status);
console.log(JSON.stringify({ok:true,scope:'PUBLIC_ONLY',sourceRevision:health.sourceRevision,resource:prm.resource,issuer:as.issuer,unauthorizedConsentStatus:unauthorized.status,ownerConsentFormPresent:true,bearerMinted:false,privateWorldlineWrite:'NOT_TESTED'}));
