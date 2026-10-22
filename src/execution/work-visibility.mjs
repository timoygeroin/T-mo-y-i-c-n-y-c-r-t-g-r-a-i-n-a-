// Read-only, privacy-minimal projection of an owned Work journal.
// It does not execute, schedule or verify an effect; never equate recorded with currently running.
const PHASES = new Set(['start','resume','compute_route','route_result','compute_reroute','causal_invalidation','causal_replan','steer','close','observation','effect_readback']);
function eventState(event){
 if(event?.phase==='effect_readback'&&event?.verification?.ok===true&&typeof event?.verification?.evidenceRef==='string'&&event.verification.evidenceRef.length>0)return 'READBACK_REPORTED';
 if(event?.phase==='route_result'||event?.phase==='compute_reroute')return 'ROUTE_OBSERVED';
 if(event?.phase==='close')return 'CLOSE_RECORDED';
 return 'OBSERVED';
}
const PUBLIC_CODES=new Set(['quota','rate_limit','capacity','provider_unavailable','provider_timeout','verification_failed','no_compute_route','unknown_failure']);
function safeCode(v){return typeof v==='string'&&PUBLIC_CODES.has(v)?v:null}
export function projectWorkVisibility(job,{after=-1,limit=40}={}) {
 if(!Number.isSafeInteger(after)||after< -1)throw Error('INVALID_CURSOR');
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('INVALID_LIMIT');
 if(!job||typeof job!=='object'||typeof job.jobId!=='string')return {schema:'monday.work-visibility.v1',state:'NOT_FOUND',events:[],nextCursor:after,hasMore:false};
 const all=Array.isArray(job.events)?job.events:[];
 const start=Math.min(all.length,after+1),end=Math.min(all.length,start+limit);
 const events=all.slice(start,end).map((event,i)=>{
  const phase=PHASES.has(event?.phase)?event.phase:'observation';
  return Object.freeze({index:start+i,phase,state:eventState(event),code:safeCode(event?.blockerCode)||safeCode(event?.reason)||null});
 });
 const state=job.status==='blocked'?'BLOCKED':job.status==='complete'?'REPORTED_COMPLETE_UNVERIFIED':'RECORDED_NOT_LIVE_CONFIRMED';
 return Object.freeze({schema:'monday.work-visibility.v1',jobId:job.jobId,state,events,
  nextCursor:events.length?events.at(-1).index:after,hasMore:end<all.length,totalEvents:all.length});
}
