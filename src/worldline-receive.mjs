/** A separate host/process independently re-opens a persisted Worldline. */
import {recoverWorldline} from './remote-worldline.mjs';
const baseUrl=process.env.MONDAYID_WORLDLINE_URL;
const readerToken=process.env.MONDAYID_WORLDLINE_READ_TOKEN;
const signalId=process.env.MONDAYID_PROOF_SIGNAL_ID;
if(!baseUrl||!readerToken||!signalId){
  console.error(JSON.stringify({ok:false,code:'WORLDLINE_URL_READ_TOKEN_AND_PROOF_SIGNAL_REQUIRED'}));
  process.exit(2);
}
const recovery=await recoverWorldline({baseUrl,readerToken,trust:'trusted',limit:1000});
if(!recovery.ok){console.error(JSON.stringify({ok:false,code:recovery.code}));process.exit(1);}
const fact=recovery.worldline.materialize().facts?.[signalId];
const value=fact?.value;
const passed=fact?.predicate==='verified_external_effect' &&
  value?.sourceSignal===signalId &&
  value?.domain==='continuity' &&
  typeof value?.actionId==='string' && value.actionId.length>0 &&
  value?.effect==='prove clean-host transfer with external write/readback';
console.log(JSON.stringify({ok:passed,state:passed?'RECOVERED_AND_MATCHED':'NOT_RECOVERED',
  signalId,actionId:passed?value.actionId:null,imported:recovery.imported,
  trust:recovery.trust},null,2));
if(!passed)process.exit(1);