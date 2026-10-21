import { randomBytes } from 'node:crypto';
import {
  mintAuthorizationCode, exchangeAuthorizationCode, verifyAccessToken,
  ownerApprovalAccepted, s256Challenge, protectedResourceMetadata
} from '../src/oauth-as.mjs';
import { authorizeMcpTool } from '../src/mcp-access.mjs';

const env=process.env;
const ownerSecret=env.MONDAYID_OAUTH_OWNER_APPROVAL_SECRET;
if(typeof env.MONDAYID_OAUTH_ISSUER_SECRET!=='string' || env.MONDAYID_OAUTH_ISSUER_SECRET.length<32 || !ownerApprovalAccepted(ownerSecret,env)){
  console.log(JSON.stringify({ok:false,code:'OAUTH_SIGNING_OR_OWNER_PROOF_NOT_CONFIGURED'}));
  process.exit(1);
}
const verifier=randomBytes(48).toString('base64url');
const clientId='mondayid-preview-selftest';
const redirectUri='https://chatgpt.com/connector/oauth/callback';
const params={env,clientId,redirectUri,codeChallenge:s256Challenge(verifier),codeChallengeMethod:'S256'};
const minted=mintAuthorizationCode(params);
if(!minted.ok)throw new Error('AUTHORIZATION_CODE_MINT_FAILED:'+minted.error);
const exchange={env,code:minted.code,clientId,redirectUri,codeVerifier:verifier};
const first=await exchangeAuthorizationCode(exchange);
if(!first.ok)throw new Error('FIRST_REDEMPTION_FAILED:'+JSON.stringify({code:first.error_description,writeHttpStatus:first.writeHttpStatus,writerStatus:first.writerStatus}));
const claims=verifyAccessToken(first.token.access_token,env);
if(claims?.principal!=='chatgpt-monday' || claims?.hostBound!==true)throw new Error('SIGNED_TOKEN_AUDIENCE_UNBOUND');
const accepted=authorizeMcpTool('bus_post',{headers:{authorization:'Bearer '+first.token.access_token}},env);
if(!accepted)throw new Error('SCOPED_MCP_BEARER_REJECTED');
const second=await exchangeAuthorizationCode(exchange);
const replayDenied=second.ok===false && second.error==='invalid_grant';
if(!replayDenied)throw new Error('REPLAY_APPROVED');
const evidence={
  ok:true,
  scope:'VERCEL_PREVIEW_SERVER_CREDENTIAL_SELF_TEST_NOT_REAL_CHATGPT_CONSENT',
  codeMinted:true,firstRedeemReadback:true,replayDenied,
  bearerPrincipal:claims.principal,hostBound:claims.hostBound,
  mcpAuthorizationRecognized:accepted,
  mcpResource:protectedResourceMetadata(env).resource,
  secretValuesEmitted:false,externalIdentityConsent:'NOT_PROVEN'
};
console.log(JSON.stringify(evidence));
