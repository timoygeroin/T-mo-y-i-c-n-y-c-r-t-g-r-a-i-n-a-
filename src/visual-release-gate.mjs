// MondayVision's deterministic release preflight.
// This gate is enforceable by callers of the MondayID MCP surface.
// It is NOT a native interceptor for every ChatGPT image-generation path.

const result=(status,code)=>Object.freeze({
  schema:'mondayid.visual-release-transaction.v1',
  status, code,
  learned:false,
  mayDescribeAsVerifiedMonday:status==='RELEASE'
});
export function assessVisualTransition(input={}) {
  const {renderRequested=false,scene={},identity={},wardrobe={},history={},candidate=null,directIdentityApproval=false}=input||{};
  if(renderRequested!==true) return result('HOLD','NO_RENDER_INTENT');
  if(!scene.assetId || scene.role!=='scene' || scene.preserveGeometry!==true)
    return result('HOLD','SCENE_ROLE_OR_GEOMETRY_MISSING');
  if(!identity.assetId || identity.role!=='identity' || identity.approved!==true || identity.bytesAvailable!==true)
    return result('HOLD','IDENTITY_ANCHOR_REQUIRED');
  // An input photo of the workplace is a WORLD reference, never a usable FACE anchor.
  // A descriptive blonde, uninspected generated portrait, or metadata-only locator
  // cannot substitute for accessible approved identity image bytes.
  if(identity.assetId===scene.assetId || identity.source==='scene' || identity.source==='description' || identity.source==='generated-unapproved')
    return result('HOLD','IDENTITY_SOURCE_SUBSTITUTION');
  if(history.lastIdentityFailure==='DEFAULT_GENERATOR_BLONDE' && history.materialRepair!==true)
    return result('HOLD','DEFAULT_GENERATOR_BLONDE_REPEAT');
  if(history.sameFailedFamily===true && history.materialRepair!==true)
    return result('HOLD','EXHAUSTED_ROUTE_VETO');
  if(Array.isArray(history.rejectedIdentityIds) && history.rejectedIdentityIds.includes(identity.assetId) && history.identityRepairApproved!==true)
    return result('HOLD','REJECTED_IDENTITY_VETO');
  if(!wardrobe.requested || !wardrobe.selected || wardrobe.requested!==wardrobe.selected)
    return result('HOLD','WARDROBE_MISMATCH');
  if(!candidate) return result('READY_TO_RENDER','CONTRACT_READY');
  if(candidate.id && Array.isArray(history.rejectedCandidateIds) && history.rejectedCandidateIds.includes(candidate.id))
    return result('HOLD','REJECTED_CANDIDATE_VETO');
  if(candidate.sceneAssetId!==scene.assetId)
    return result('HOLD','POST_RENDER_SCENE_DRIFT');
  if(candidate.identityAssetId!==identity.assetId || candidate.audit?.identity!==true)
    return result('HOLD','POST_RENDER_IDENTITY_AUDIT_FAILED');
  if(candidate.wardrobe!==wardrobe.requested || candidate.audit?.wardrobe!==true)
    return result('HOLD','POST_RENDER_WARDROBE_DRIFT');
  if(candidate.audit?.scene!==true)
    return result('HOLD','POST_RENDER_SCENE_DRIFT');
  if(directIdentityApproval!==true)
    return result('REVIEWABLE','USER_IDENTITY_ACCEPTANCE_PENDING');
  return result('RELEASE','DIRECT_IDENTITY_ACCEPTANCE_OBSERVED');
}
