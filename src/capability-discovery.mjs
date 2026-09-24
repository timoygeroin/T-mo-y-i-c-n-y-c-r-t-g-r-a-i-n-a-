const VALID_STATES=new Set(['AVAILABLE','UNAVAILABLE','VISIBLE_ONLY','BLOCKED','UNKNOWN']);

function structuralState(receptor){
  if(!receptor) return 'UNAVAILABLE';
  if(typeof receptor.execute !== 'function') return 'VISIBLE_ONLY';
  if(typeof receptor.verify !== 'function') return 'BLOCKED';
  return 'AVAILABLE';
}

export async function discoverCapabilities(adapters = []) {
  const manifest=[];
  const capabilities={};

  for(const adapter of adapters){
    const id=String(adapter?.id || adapter?.domain || adapter?.receptor?.name || 'unknown');
    const domain=String(adapter?.domain || id);
    const receptor=adapter?.receptor || null;
    let state=structuralState(receptor);
    let evidence=[];

    if(typeof adapter?.probe === 'function'){
      try{
        const probe=await adapter.probe({id,domain,receptor});
        if(probe?.state && VALID_STATES.has(String(probe.state))){
          state=String(probe.state);
        } else if(probe?.ok === false){
          state='BLOCKED';
        }
        evidence=Array.isArray(probe?.evidence) ? probe.evidence.map(String) : [];
      }catch(error){
        state='UNKNOWN';
        evidence=[String(error)];
      }
    }

    const entry=Object.freeze({
      id,
      domain,
      state,
      receptor:receptor?.name || null,
      executable:state==='AVAILABLE' && typeof receptor?.execute==='function',
      verifiable:state==='AVAILABLE' && typeof receptor?.verify==='function',
      evidence:Object.freeze(evidence)
    });
    manifest.push(entry);

    if(entry.executable && entry.verifiable){
      capabilities[domain]=receptor;
    }
  }

  return Object.freeze({
    schema:'mondayid.capability-manifest.v1',
    discoveredAt:new Date().toISOString(),
    manifest:Object.freeze(manifest),
    capabilities
  });
}
