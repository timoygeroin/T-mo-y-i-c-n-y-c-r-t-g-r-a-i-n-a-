import test from 'node:test';
import assert from 'node:assert/strict';
import { assessVisualTransition } from '../src/visual-release-gate.mjs';

const valid = () => ({
  renderRequested:true,
  scene:{assetId:'USER_TERRACE_PHOTO',role:'scene',preserveGeometry:true},
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
