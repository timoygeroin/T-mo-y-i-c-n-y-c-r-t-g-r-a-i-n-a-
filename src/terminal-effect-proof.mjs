/**
 * A finish-only request is NOT satisfied by a model saying "done".
 * Only material obligations with exact, independently witnessed host effects
 * can unlock a terminal completion message.
 *
 * This module is intentionally separate from the model provider. It reads
 * runtime evidence, never language-model self-attestation.
 */
const nonempty=x=>typeof x==='string'&&x.trim().length>0;

export function assessTerminalEffectProof({signal={},pass={},surface={}}={}) {
  const obligations=(Array.isArray(signal.obligations)?signal.obligations:[])
    .filter(o=>o?.binding==='obligation'&&o.material!==false&&o.status==='OPEN');
  if(!obligations.length) return Object.freeze({
    verified:false,code:'MATERIAL_OBLIGATIONS_UNSPECIFIED',evidenceRefs:[]
  });
  if(!nonempty(signal.id)) return Object.freeze({
    verified:false,code:'SOURCE_SIGNAL_ID_MISSING',evidenceRefs:[]
  });
  if(pass.ok!==true||pass.state!=='FULFILLED'||surface.released!==true) {
    return Object.freeze({verified:false,code:'TERMINAL_PASS_NOT_FULFILLED',evidenceRefs:[]});
  }
  if(pass.final?.meta?.state==='HOLD') return Object.freeze({
    verified:false,code:'META_PROOF_ON_HOLD',evidenceRefs:[]
  });
  const results=Array.isArray(pass.final?.results)?pass.final.results:[];
  const evidenceRefs=[];
  for(const obligation of obligations) {
    if(!nonempty(obligation.id)||!nonempty(obligation.domain)) {
      return Object.freeze({verified:false,code:'INVALID_MATERIAL_OBLIGATION',evidenceRefs:[]});
    }
    const witness=results.find(r=>{
      const a=r?.action||{};
      const v=r?.verification||{};
      const p=v.independentProof||{};
      const distinctObservedChange=signal.requireObservableDelta!==true ||
        (p.effectObserved===true && p.noOpControlPassed===false);
      return r.ok===true &&
        r.ledger?.state==='COMMITTED' &&
        a.obligationId===obligation.id &&
        a.domain===obligation.domain &&
        a.sourceSignal===signal.id &&
        nonempty(a.id) &&
        v.ok===true &&
        v.mode==='external-exact-readback' &&
        nonempty(v.evidenceRef) &&
        distinctObservedChange &&
        p.source==='HOST_READER' &&
        p.effectId===a.id &&
        p.domain===a.domain &&
        p.sourceSignal===a.sourceSignal &&
        nonempty(p.evidenceRef);
    });
    if(!witness) return Object.freeze({
      verified:false,code:'MATERIAL_EFFECT_READBACK_MISSING',evidenceRefs:[]
    });
    evidenceRefs.push(witness.verification.independentProof.evidenceRef);
  }
  return Object.freeze({verified:true,code:'ALL_MATERIAL_EFFECTS_WITNESSED',
    evidenceRefs:Object.freeze(evidenceRefs)});
}
