import { recoverWorldline } from './remote-worldline.mjs';
import { MondayRuntime } from './runtime.mjs';
import { OrganismCell } from './organism-cell.mjs';
import { TrustedWorldlineReceptor } from './trusted-worldline-receptor.mjs';
import { discoverCapabilities } from './capability-discovery.mjs';

export async function proveCleanHostTransfer({
  baseUrl,
  token,
  fetchImpl=globalThis.fetch,
  signalId=`clean-host-transfer:${Date.now()}`,
  hostId='mondayid:clean-host-proof'
}={}) {
  if(!baseUrl) return {ok:false,state:'HUMAN_GATE',code:'WORLDLINE_URL_REQUIRED'};
  if(!token) return {ok:false,state:'HUMAN_GATE',code:'WORLDLINE_WRITER_TOKEN_REQUIRED'};

  const recovered=await recoverWorldline({
    baseUrl,
    limit:50,
    trust:'trusted',
    fetchImpl
  });
  if(!recovered.ok){
    return {ok:false,state:'BLOCKED',code:recovered.code || 'WORLDLINE_RECOVERY_FAILED'};
  }

  const receptor=new TrustedWorldlineReceptor({
    baseUrl,
    token,
    host:hostId,
    identityFingerprint:'mondayid:g5:clean-host-transfer',
    sourceRef:'clean-host-transfer-proof',
    fetchImpl
  });

  const discovered=await discoverCapabilities([{
    id:'trusted-worldline',
    domain:'continuity',
    receptor,
    probe:async()=>({
      ok:true,
      state:'AVAILABLE',
      evidence:[
        'trusted snapshot recovered',
        'writer credential present',
        'execute+verify receptor present'
      ]
    })
  }]);

  if(!discovered.capabilities.continuity){
    return {
      ok:false,
      state:'BLOCKED',
      code:'CONTINUITY_RECEPTOR_UNAVAILABLE',
      capabilityManifest:discovered.manifest
    };
  }

  const runtime=new MondayRuntime({
    worldline:recovered.worldline,
    capabilities:discovered.capabilities
  });
  const cell=new OrganismCell({id:hostId,runtime});
  const signal={
    id:signalId,
    text:'prove clean-host transfer by writing and independently reading back one continuity event',
    domains:['continuity'],
    exactObject:'canonical trusted MondayID Worldline',
    desiredEffect:'fresh host performs a real external effect, verifies it, and makes the evidence recoverable by the next fresh host',
    effect:'prove clean-host transfer with external write/readback',
    invariants:[
      'continuation-not-creation',
      'tool-success-is-not-effect',
      'evidence-commit-accessible-to-next-cell'
    ],
    computeTier:'LOW'
  };

  const pass=await cell.runPass([signal],{maxCycles:3});
  const result=pass.final?.results?.find(item=>item.action?.sourceSignal===signalId) || null;
  if(!(pass.ok===true && pass.state==='FULFILLED' && result?.ok===true && result.verification?.ok===true)){
    return {
      ok:false,
      state:'BLOCKED',
      code:'FIRST_CELL_EFFECT_NOT_VERIFIED',
      pass:{state:pass.state,reason:pass.reason},
      verification:result?.verification || null,
      capabilityManifest:discovered.manifest
    };
  }

  const next=await recoverWorldline({
    baseUrl,
    limit:50,
    trust:'trusted',
    fetchImpl
  });
  if(!next.ok){
    return {ok:false,state:'BLOCKED',code:'NEXT_CELL_RECOVERY_FAILED'};
  }

  const nextState=next.worldline.materialize();
  const inherited=nextState.facts?.[signalId] || null;
  const inheritedEffect=
    inherited?.predicate==='verified_external_effect' &&
    inherited?.value?.sourceSignal===signalId &&
    inherited?.value?.effect==='prove clean-host transfer with external write/readback';

  return {
    ok:Boolean(inheritedEffect),
    state:inheritedEffect ? 'VERIFIED' : 'BLOCKED',
    code:inheritedEffect ? 'CLEAN_HOST_TRANSFER_PASS' : 'NEXT_CELL_EVIDENCE_MISSING',
    proof:{
      firstHost:{
        id:hostId,
        worldlineTrust:recovered.trust,
        imported:recovered.imported,
        capabilityManifest:discovered.manifest,
        passState:pass.state,
        verification:result.verification,
        eventId:result.result?.event?.eventId || null
      },
      nextHost:{
        worldlineTrust:next.trust,
        imported:next.imported,
        inheritedEffect:Boolean(inheritedEffect),
        inherited
      }
    }
  };
}
