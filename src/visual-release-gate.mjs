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
  if(history.sameFailedFamily===true && history.materialRepair!==true)
    return result('HOLD','EXHAUSTED_ROUTE_VETO');
  if(Array.isArray(history.rejectedIdentityIds) && history.rejectedIdentityIds.includes(identity.assetId) && history.identityRepairApproved!==true)
    return result('HOLD','REJECTED_IDENTITY_VETO');
  if(!wardrobe.requested || !wardrobe.selected || wardrobe.requested!==wardrobe.selected)
    return result('HOLD','WARDROBE_MISMATCH');
  if(!candidate) return result('READY_TO_RENDER','CONTRACT_READY');
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
