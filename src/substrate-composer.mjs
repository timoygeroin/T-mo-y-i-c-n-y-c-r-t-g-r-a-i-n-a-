// Compile existing owner-trusted deterministic primitives into local effect routes.
// This does not synthesize code, run a model, execute any step or prove equivalence.
// The existing Effect ABI and optimizer remain execution and authorization gates.
const word=x=>typeof x==='string' && /^[a-z][a-z0-9._:-]{0,119}$/i.test(x);
const nonnegative=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const hasEstimate=p=>p&&['cashUsd','workUnits','networkBytes'].every(k=>nonnegative(p[k]));

export function composePrimitiveRoutes({capability,sourceType,targetType,input,primitives=[],readback,maxStages=5}={}) {
  if(!word(capability)||!word(sourceType)||!word(targetType)||!Array.isArray(primitives)||
     primitives.length>32||!Number.isInteger(maxStages)||maxStages<1||maxStages>6||typeof readback!=='function') {
    return {code:'INVALID_COMPOSITION',routes:[],rejections:[]};
  }
  const compatible=[],rejections=[],ids=new Set();
  for(const p of primitives){
    const id=p?.id||null;
    let reason=null;
    if(!word(id)||!word(p.from)||!word(p.to)||!word(p.provenance)||
       p.quality!=='exact'&&p.quality!=='approximate')reason='INVALID_PRIMITIVE';
    else if(ids.has(id))reason='DUPLICATE_PRIMITIVE';
    else if(p.pure!==true||p.privacy!=='local'||typeof p.apply!=='function')reason='UNTRUSTED_PRIMITIVE';
    else if(!hasEstimate(p.resourceEstimate))reason='UNKNOWN_RESOURCES';
    if(reason){rejections.push({id,code:reason});continue;}
    ids.add(id);compatible.push(p);
  }
  const adjacency=new Map();
  for(const p of compatible){const edges=adjacency.get(p.from)||[];edges.push(p);adjacency.set(p.from,edges);}
  const routes=[];
  function emit(path){
    if(routes.length>=64)return;
    const profile=path.reduce((acc,p)=>({cashUsd:acc.cashUsd+p.resourceEstimate.cashUsd,
      workUnits:acc.workUnits+p.resourceEstimate.workUnits,
      networkBytes:acc.networkBytes+p.resourceEstimate.networkBytes}),{cashUsd:0,workUnits:0,networkBytes:0});
    const stages=path.map(p=>p.id);
    const adapterId='local-composition:'+stages.join('+');
    routes.push({id:adapterId,method:'deterministic',quality:path.every(p=>p.quality==='exact')?'exact':'approximate',
      provenance:path.map(p=>p.provenance).join(' | '),stages,resourceEstimate:profile,readback,
      adapter:{id:adapterId,privacy:'local',capabilities:[capability],estimate:async()=>profile.cashUsd,
        execute:async capsule=>{
          let value=input;
          for(const p of path)value=await p.apply(value,{capsule,stageId:p.id});
          return {value,outputType:targetType,stages};
        }}});
  }
  function walk(current,path,visited){
    if(current===targetType){if(path.length)emit([...path]);return;}
    if(path.length>=maxStages||routes.length>=64)return;
    for(const p of adjacency.get(current)||[]){
      if(visited.has(p.to))continue;
      walk(p.to,[...path,p],new Set([...visited,p.to]));
    }
  }
  walk(sourceType,[],new Set([sourceType]));
  return {code:routes.length?'COMPOSED':'NO_COMPOSITION',routes,rejections};
}
