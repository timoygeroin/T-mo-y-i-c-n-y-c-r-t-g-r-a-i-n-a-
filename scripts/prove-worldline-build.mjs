import { TrustedWorldlineReceptor } from '../src/trusted-worldline-receptor.mjs';

const receptor = new TrustedWorldlineReceptor({
  baseUrl: process.env.MONDAYID_WORLDLINE_URL,
  token: process.env.MONDAYID_WORLDLINE_WRITER_TOKEN,
  host: 'mondayid-vercel-build-proof',
  identityFingerprint: 'mondayid:rewrite:g5',
  sourceRef: 'mondayid:vercel-build:trusted-write-readback'
});

const action = Object.freeze({
  objectiveId: 'mondayid-production:trusted-write-readback',
  sourceSignal: 'mondayid:vercel-build:proof',
  domain: 'continuity',
  effect: 'prove the exact production source revision can persist and exact-readback one authenticated external effect'
});

const write = await receptor.execute(action);
if (!write.ok) {
  throw new Error(`TRUSTED_WORLDLINE_WRITE_FAILED:${write.code || write.status || 'UNKNOWN'}`);
}

const verification = await receptor.verify(write);
if (!verification.ok) {
  throw new Error(`TRUSTED_WORLDLINE_READBACK_FAILED:${verification.code || verification.status || 'UNKNOWN'}`);
}

const receipt = {
  ok: true,
  proof: 'trusted-worldline-write-readback',
  eventId: write.event?.eventId || null,
  writeStatus: write.status ?? null,
  verification: {
    ok: true,
    mode: verification.mode || null,
    eventId: verification.event?.eventId || verification.eventId || write.event?.eventId || null
  },
  sourceRevision: process.env.VERCEL_GIT_COMMIT_SHA || null
};

if (!receipt.eventId || receipt.verification.eventId !== receipt.eventId) {
  throw new Error('TRUSTED_WORLDLINE_EXACT_EVENT_MISMATCH');
}

console.log(`MONDAYID_WORLDLINE_PROOF ${JSON.stringify(receipt)}`);
