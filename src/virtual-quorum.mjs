// Evidence-bound virtual quorum. Pure, deterministic, no claims of live external agents.
export const QUORUM_ROLES = Object.freeze(['intent','history','alternatives','executor','falsifier','experience','verifier']);
export function assessQuorum({request, desiredEffect, candidates=[], observations=[]}={}) {
  if(typeof request!=='string'||!request.trim()) throw new TypeError('request required');
  if(typeof desiredEffect!=='string'||!desiredEffect.trim()) throw new TypeError('desiredEffect required');
  const scored=candidates.map((candidate,index)=>{
    const supports=observations.filter(o=>o?.candidateId===candidate.id&&o?.verified===true&&o?.kind==='effect');
    const veto=observations.some(o=>o?.candidateId===candidate.id&&o?.verified===true&&o?.kind==='counterexample');
    const matches= candidate?.effect===desiredEffect;
    return {id:candidate.id??index,matchesGoal:matches,verifiedEffect:supports.length>0,veto,success:matches&&supports.length>0&&!veto};
  });
  const winner=scored.find(s=>s.success);
  return {request,desiredEffect,roles:QUORUM_ROLES,terminal:!!winner,status:winner?'VERIFIED_EFFECT':'UNRESOLVED',winnerId:winner?.id??null,assessments:scored};
}
