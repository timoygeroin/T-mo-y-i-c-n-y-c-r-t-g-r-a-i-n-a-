import test from 'node:test';
import assert from 'node:assert/strict';
import { assessVisualTransition } from '../src/visual-release-gate.mjs';

const valid = () => ({
  renderRequested:true,
  explicitImageIntent:true,
  scene:{assetId:'USER_TERRACE_PHOTO',role:'scene',preserveGeometry:true,userPresence:'absent'},
  identity:{assetId:'APPROVED_DERIVATIVE_FACE',role:'identity',approved:true,bytesAvailable:true},
  wardrobe:{requested:'black-square-neck-gray-skirt',selected:'black-square-neck-gray-skirt'},
  history:{sameFailedFamily:false,materialRepair:false}
});

test('scene photo or plugin mention alone cannot trigger a new Monday render',()=>{
  const r=assessVisualTransition({...valid(),renderRequested:false});
  assert.equal(r.status,'HOLD');
  assert.equal(r.code,'NO_RENDER_INTENT');
});
test('do not fill missing Monday identity with generic blonde text',()=>{
  const r=assessVisualTransition({...valid(),identity:{role:'identity',approved:false,bytesAvailable:false}});
  assert.equal(r.status,'HOLD');
  assert.equal(r.code,'IDENTITY_ANCHOR_REQUIRED');
});
test('do not retry same rejected route without causal repair',()=>{
  const r=assessVisualTransition({...valid(),history:{sameFailedFamily:true,materialRepair:false}});
  assert.equal(r.code,'EXHAUSTED_ROUTE_VETO');
});
test('preserve the latest wardrobe rather than stale beige prompt',()=>{
  const x=valid(); x.wardrobe.selected='glossy-beige-minidress';
  assert.equal(assessVisualTransition(x).code,'WARDROBE_MISMATCH');
});
test('a valid pre-render contract is eligible but is not release evidence',()=>{
  assert.equal(assessVisualTransition(valid()).status,'READY_TO_RENDER');
});
test('a generic or uninspected image fails Monday identity release',()=>{
  const x=valid();
  x.candidate={sceneAssetId:'USER_TERRACE_PHOTO',identityAssetId:'APPROVED_DERIVATIVE_FACE',wardrobe:'black-square-neck-gray-skirt',audit:{identity:false,scene:true,wardrobe:true}};
  assert.equal(assessVisualTransition(x).code,'POST_RENDER_IDENTITY_AUDIT_FAILED');
});
test('post-render audit allows provisional review, never self-certified LEARNED',()=>{
  const x=valid();
  x.candidate={sceneAssetId:'USER_TERRACE_PHOTO',identityAssetId:'APPROVED_DERIVATIVE_FACE',wardrobe:'black-square-neck-gray-skirt',audit:{identity:true,scene:true,wardrobe:true}};
  const r=assessVisualTransition(x);
  assert.equal(r.status,'REVIEWABLE');
  assert.equal(r.learned,false);
});
test('release as Monday requires independent direct identity acceptance',()=>{
  const x=valid();
  x.candidate={sceneAssetId:'USER_TERRACE_PHOTO',identityAssetId:'APPROVED_DERIVATIVE_FACE',wardrobe:'black-square-neck-gray-skirt',audit:{identity:true,scene:true,wardrobe:true}};
  x.directIdentityApproval=true;
  assert.equal(assessVisualTransition(x).status,'RELEASE');
});

test('21 Oct 2026 store scene does not authorize a fresh generic blonde face',()=>{
  const x=valid();
  x.scene={assetId:'20261021_STREET_MOBILE_PHOTO',role:'scene',preserveGeometry:true,userPresence:'absent'};
  x.identity={assetId:'DESCRIPTIVE_PLATINUM_BLONDE',role:'identity',approved:false,bytesAvailable:false,source:'description'};
  x.wardrobe={requested:'scene-appropriate',selected:'scene-appropriate'};
  assert.equal(assessVisualTransition(x).code,'IDENTITY_ANCHOR_REQUIRED');
});
test('scene pixels cannot become identity pixels via flag spoofing',()=>{
  const x=valid();
  x.identity={assetId:x.scene.assetId,role:'identity',approved:true,bytesAvailable:true,source:'scene'};
  assert.equal(assessVisualTransition(x).code,'IDENTITY_SOURCE_SUBSTITUTION');
});
test('a generic description cannot masquerade as approved identity bytes',()=>{
  const x=valid();
  x.identity.source='description';
  assert.equal(assessVisualTransition(x).code,'IDENTITY_SOURCE_SUBSTITUTION');
});
test('repeated DEFAULT_GENERATOR_BLONDE stays blocked until material reference repair',()=>{
  const x=valid();
  x.history={lastIdentityFailure:'DEFAULT_GENERATOR_BLONDE',materialRepair:false};
  assert.equal(assessVisualTransition(x).code,'DEFAULT_GENERATOR_BLONDE_REPEAT');
});
test('rejected previously generated candidate cannot reenter as Monday',()=>{
  const x=valid();
  x.history={rejectedCandidateIds:['ef633ba8-5980-4ace-b660-8217dfda778e']};
  x.candidate={id:'ef633ba8-5980-4ace-b660-8217dfda778e',sceneAssetId:x.scene.assetId,identityAssetId:x.identity.assetId,wardrobe:x.wardrobe.requested,audit:{identity:true,scene:true,wardrobe:true}};
  x.directIdentityApproval=true;
  assert.equal(assessVisualTransition(x).code,'REJECTED_CANDIDATE_VETO');
});


// Regression: 27 Oct Sinamoll selfie video -> generic blonde + stranger substitution.
test('flirtation and scene cannot substitute for explicit image creation intent',()=>{
  const x=valid(); x.explicitImageIntent=false;
  assert.equal(assessVisualTransition(x).code,'IMAGE_INTENT_NOT_CONFIRMED');
});
test('unknown source-media user presence must hold',()=>{
  const x=valid(); delete x.scene.userPresence;
  assert.equal(assessVisualTransition(x).code,'USER_PRESENCE_UNCLASSIFIED');
});
test('user selfie cannot render with only a Monday face anchor',()=>{
  const x=valid(); x.scene={assetId:'IMG_4660.mp4',role:'scene',preserveGeometry:true,userPresence:'present'};
  assert.equal(assessVisualTransition(x).code,'USER_IDENTITY_SOURCE_REQUIRED');
});
test('never replace the user with Monday or reuse one face source across identities',()=>{
  const x=valid(); x.scene.userPresence='present';
  x.userIdentity={assetId:x.identity.assetId,role:'user',approved:true,bytesAvailable:true,preserveFace:true};
  assert.equal(assessVisualTransition(x).code,'CROSS_IDENTITY_SOURCE_SUBSTITUTION');
});
test('release veto: candidate depicts synthetic stranger instead of user',()=>{
  const x=valid(); x.scene.userPresence='present';
  x.userIdentity={assetId:x.scene.assetId,role:'user',approved:true,bytesAvailable:true,preserveFace:true};
  x.candidate={sceneAssetId:x.scene.assetId,identityAssetId:x.identity.assetId,userIdentityAssetId:'SYNTHETIC_MAN',wardrobe:x.wardrobe.requested,audit:{scene:true,identity:true,userIdentity:false,wardrobe:true}};
  x.directIdentityApproval=true;
  assert.equal(assessVisualTransition(x).code,'POST_RENDER_USER_IDENTITY_AUDIT_FAILED');
});
test('verified separate identities reach only REVIEWABLE until direct acceptance',()=>{
  const x=valid(); x.scene.userPresence='present';
  x.userIdentity={assetId:x.scene.assetId,role:'user',approved:true,bytesAvailable:true,preserveFace:true};
  x.candidate={sceneAssetId:x.scene.assetId,identityAssetId:x.identity.assetId,userIdentityAssetId:x.scene.assetId,wardrobe:x.wardrobe.requested,audit:{scene:true,identity:true,userIdentity:true,wardrobe:true}};
  assert.equal(assessVisualTransition(x).status,'REVIEWABLE');
  assert.equal(assessVisualTransition({...x,directIdentityApproval:true}).status,'RELEASE');
});
