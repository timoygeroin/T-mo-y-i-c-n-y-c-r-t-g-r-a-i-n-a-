// Host-owned reader. Not the executor; reads the transport again and validates
// action identity, provenance, and scope before returning a witness receipt.
export function createWorldlineIndependentReadback({
  baseUrl,readerToken,fetchImpl=globalThis.fetch,
  host='mondayid:clean-host-proof',
  identityFingerprint='mondayid:g5:clean-host-transfer',
  sourceRef='clean-host-transfer-proof'
}={}) {
  return async function independentReadback({action,result}) {
    if(!baseUrl || !readerToken || typeof fetchImpl!=='function')return {ok:false,code:'READER_UNAVAILABLE'};
    if(!action || typeof action.id!=='string' || !action.id ||
       typeof action.domain!=='string' || !action.domain ||
       typeof action.sourceSignal!=='string' || !action.sourceSignal ||
       result?.ok!==true || typeof result?.event?.eventId!=='string')
      return {ok:false,code:'ACTION_IDENTITY_MISSING'};
    const url=new URL('/worldline/v4/event',baseUrl);
    url.searchParams.set('eventId',result.event.eventId);
    let response;
    try{response=await fetchImpl(url,{headers:{authorization:`Bearer ${readerToken}`}});}
    catch{return {ok:false,code:'READER_TRANSPORT_FAILED'};}
    if(!response?.ok)return {ok:false,code:'READER_HTTP_ERROR'};
    let body;
    try{body=await response.json();}catch{return {ok:false,code:'READER_INVALID_JSON'};}
    const event=body?.event;
    if(body?.schema!=='mondayid.worldline.event.v0.4.0' ||
       (Array.isArray(body?.conflicts) && body.conflicts.length>0) ||
       !Array.isArray(body?.conflicts) ||
       event?.eventId!==result.event.eventId ||
       event?.host!==host || event?.identityFingerprint!==identityFingerprint ||
       event?.sourceRef!==sourceRef || event?.predicate!=='verified_external_effect' ||
       event?.epistemicStatus!=='VERIFIED' ||
       typeof event?.writerKeyId!=='string' || !event.writerKeyId.trim())
      return {ok:false,code:'READER_PROVENANCE_MISMATCH'};
    let core;
    try{core=JSON.parse(event.valueJson);}catch{return {ok:false,code:'READER_INVALID_EFFECT'};}
    if(core?.actionId!==action.id ||
       core?.objectiveId!==(action.objectiveId??null) ||
       core?.sourceSignal!==action.sourceSignal ||
       core?.domain!==action.domain ||
       core?.effect!==(action.effect??null))
      return {ok:false,code:'READER_EFFECT_MISMATCH'};
    return {
      ok:true,effectId:action.id,domain:action.domain,
      sourceSignal:action.sourceSignal,
      evidenceRef:`worldline:v4:${event.eventId}`,
      effectObserved:true
    };
  };
}