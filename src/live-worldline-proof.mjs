import { TrustedWorldlineReceptor } from './trusted-worldline-receptor.mjs';

const baseUrl=process.env.MONDAYID_WORLDLINE_URL;
const token=process.env.MONDAYID_WORLDLINE_WRITER_TOKEN;
const proofId=process.env.MONDAYID_PROOF_ID || 'manual';

const receptor=new TrustedWorldlineReceptor({
  baseUrl,
  token,
  host:'mondayid-rewrite-live-proof',
  identityFingerprint:'mondayid:rewrite:g5',
  sourceRef:`rewrite-head:${proofId}`
});

const action={
  objectiveId:`live-worldline-proof:${proofId}`,
  sourceSignal:'cutover:shared-worldline-write',
  domain:'continuity',
  effect:'persist and read back one authenticated external effect'
};

const result=await receptor.execute(action);
if (!result.ok) {
  console.error(JSON.stringify({ok:false,stage:'execute',code:result.code,status:result.status ?? null}));
  process.exit(1);
}

const verification=await receptor.verify(result);
if (!verification.ok) {
  console.error(JSON.stringify({ok:false,stage:'verify',verification}));
  process.exit(1);
}

console.log(JSON.stringify({
  ok:true,
  transport:'trusted-worldline-v4',
  writeStatus:result.status,
  eventId:result.event.eventId,
  verification
},null,2));
