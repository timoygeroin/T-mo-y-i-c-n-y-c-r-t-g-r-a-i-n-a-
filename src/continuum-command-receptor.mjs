import {runLocalAction} from './consumer-local-receptor.mjs';

/**
 * Bridge the existing Monday local intent engine to the current Continuum
 * browser workspace. No remote effect or model inference is implied.
 * The consumer returns success only after the stored object is read back.
 */
export async function executeContinuumCommand({text,load,save,nextId,at=Date.now()}={}){
  if(typeof load!=='function'||typeof save!=='function'||typeof nextId!=='function'){
    return {handled:true,ok:false,code:'LOCAL_BRIDGE_UNAVAILABLE'};
  }
  let before;
  try{before=await load();}catch{return {handled:true,ok:false,code:'LOCAL_READ_UNAVAILABLE'};}
  if(!before||!Array.isArray(before.tasks)||!Array.isArray(before.events)){
    return {handled:true,ok:false,code:'LOCAL_WORKSPACE_INVALID'};
  }
  return runLocalAction({
    text,state:before,nextId,at,
    write:async next=>{
      const tasks=next.tasks.map(t=>({
        ...t,
        checkpoints:Array.isArray(t.checkpoints)?t.checkpoints:[],
        createdAt:t.createdAt||new Date(at).toISOString(),
        updatedAt:typeof t.updatedAt==='number'?new Date(t.updatedAt).toISOString():t.updatedAt
      }));
      return save({...next,tasks});
    },
    read:load
  });
}
