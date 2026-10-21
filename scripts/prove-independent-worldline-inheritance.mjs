import { recoverWorldline } from '../src/remote-worldline.mjs';

const expectedSignal='clean-host-transfer:1792577020207';
const expectedEventId='E-RW4-5f61949ba6052a4f3e1ec1c6';
const r=await recoverWorldline({
  baseUrl:process.env.MONDAYID_WORLDLINE_URL,
  readerToken:process.env.MONDAYID_WORLDLINE_READ_TOKEN,
  trust:'trusted',
  limit:100
});
if(!r.ok) {
  console.error(JSON.stringify({ok:false,code:r.code || 'WORLDLINE_RECOVERY_FAILED',status:r.status ?? null}));
  process.exit(1);
}
const fact=r.worldline.materialize().facts?.[expectedSignal];
const event=r.snapshot?.events?.find(x=>x.eventId===expectedEventId);
const ok=Boolean(
  event?.predicate==='verified_external_effect' &&
  fact?.value?.sourceSignal===expectedSignal &&
  fact?.value?.effect==='prove clean-host transfer with external write/readback' &&
  fact?.predicate==='verified_external_effect'
);
const report={ok,scope:'INDEPENDENT_VERCEL_PREVIEW_BUILD',eventId:expectedEventId,imported:r.imported,readTrust:r.trust,inheritedEvent:Boolean(event),materializedFact:Boolean(fact),secretValuesEmitted:false};
console.log(JSON.stringify(report));
if(!ok)process.exit(1);
