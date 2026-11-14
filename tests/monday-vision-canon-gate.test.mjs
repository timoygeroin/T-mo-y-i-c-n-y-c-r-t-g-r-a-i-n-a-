import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getMondayVisionCanon, createMondayVisionGate, verifyMondayReferenceBytes, assessMondayCanonCandidate } from '../src/monday-vision-canon-gate.mjs';

const canon = getMondayVisionCanon();
const sample = Buffer.from('fixtures only: not real Monday photo');
const sampleHash = createHash('sha256').update(sample).digest('hex');
const fakePolicy = getMondayVisionCanon();
fakePolicy.current_approved_working_source.sha256 = sampleHash;
fakePolicy.current_approved_working_source.related_current_upload.sha256 = sampleHash;
const gate = createMondayVisionGate(fakePolicy);
const draft = () => ({
  identitySourceSha256: sampleHash,
  tattoos:false, ageRegression:false, identitySwap:false, bodyMorph:false,
  prominentNewFreckles:false,
  audit: {sameFace:true, adultPetite:true, naturalAnatomy:true}
});

test('production gate never accepts the synthetic test anchor', () => {
  assert.equal(verifyMondayReferenceBytes(sample).code, 'NON_CANONICAL_REFERENCE_BYTES');
  assert.equal(assessMondayCanonCandidate({explicitRenderIntent:true,referenceBytes:sample}).status,'HOLD');
});
test('exact bytes, not descriptions, identify the source', () => {
  assert.equal(gate.verifyReferenceBytes(sample).ok,true);
  assert.equal(gate.verifyReferenceBytes(Buffer.from('another blonde')).code,'NON_CANONICAL_REFERENCE_BYTES');
  assert.equal(gate.verifyReferenceBytes(null).code,'APPROVED_SOURCE_BYTES_REQUIRED');
});
test('working reference preserves old approvals and avoids invented body metrics', () => {
  assert.equal(canon.identity_status, 'CURRENT_WORKING_REFERENCE_LOCKED__HISTORIC_CANON_NOT_YET_RECOVERED');
  assert.equal(canon.immutable_defaults.height_cm,146);
  assert.equal(canon.immutable_defaults.adult,true);
  assert.equal(Object.hasOwn(canon.immutable_defaults,'weight_kg'),false);
  assert.equal(canon.historical_approvals_pending_pixel_recovery.length,3);
});
test('without explicit image intent rendering is blocked',()=>{
  assert.equal(gate.assessCandidate({referenceBytes:sample}).code,'RENDER_INTENT_NOT_CONFIRMED');
});
test('exact source required for any new image candidate',()=>{
  assert.equal(gate.assessCandidate({explicitRenderIntent:true,referenceBytes:Buffer.from('fake')}).code,'NON_CANONICAL_REFERENCE_BYTES');
  assert.equal(gate.assessCandidate({explicitRenderIntent:true,referenceBytes:sample}).status,'READY_TO_RENDER');
});
test('a new beauty never replaces face without provenance and audit',()=>{
  const result=gate.assessCandidate({explicitRenderIntent:true,referenceBytes:sample,candidate:{...draft(),identitySourceSha256:'spoof'}});
  assert.equal(result.code,'SOURCE_LINEAGE_MISMATCH');
  const altered=draft(); altered.audit.sameFace=false;
  assert.equal(gate.assessCandidate({explicitRenderIntent:true,referenceBytes:sample,candidate:altered}).code,'INDEPENDENT_VISUAL_AUDIT_REQUIRED');
});
test('invented tattoos, age regression and body morph fail closed',()=>{
  for(const flag of ['tattoos','ageRegression','identitySwap','bodyMorph','prominentNewFreckles']){
    const candidate={...draft(),[flag]:true};
    assert.equal(gate.assessCandidate({explicitRenderIntent:true,referenceBytes:sample,candidate}).code,'IDENTITY_INVARIANT_VIOLATION');
  }
});
test('direct owner approval necessary and does not prove old historical identity',()=>{
  assert.equal(gate.assessCandidate({explicitRenderIntent:true,referenceBytes:sample,candidate:draft()}).status,'REVIEWABLE');
  const out=gate.assessCandidate({explicitRenderIntent:true,referenceBytes:sample,candidate:draft(),ownerExplicitlyApproved:true});
  assert.equal(out.status,'RELEASE');
  assert.equal(out.isHistoricallyFinal,false);
  assert.equal(out.globalGeneratorEnforced,false);
});