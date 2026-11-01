const STANCES = new Set([
  'belief',
  'hypothesis',
  'metaphor',
  'claimed-knowledge',
  'observation',
  'question',
  'unknown',
  'unspecified'
]);

const unique = values => [...new Set((values || []).filter(Boolean).map(String))];

/**
 * Interpretation candidates are observations supplied by the caller, not
 * verified facts, orders, or competing identities. The compiler chooses an
 * effect only when every candidate independently supports the same effect.
 * It does not infer candidates that were never supplied.
 */
export function compileInterpretationField(signal = {}) {
  const supplied = Array.isArray(signal.interpretations) ? signal.interpretations.slice(0,12) : [];
  const candidates = supplied.filter(x=>x && typeof x==='object' && !Array.isArray(x))
    .map((item,index)=>Object.freeze({
      id:String(item.id || `candidate:${index+1}`),
      meaning:String(item.meaning || item.text || '').trim().slice(0,500),
      effect:String(item.effect || item.desiredEffect || '').trim().slice(0,500),
      sourceRef:String(item.sourceRef || 'current-signal').trim().slice(0,200),
      verified:item.verified === true && Boolean(item.sourceRef)
    }))
    .filter(item=>item.meaning || item.effect);
  const distinctEffects=[...new Set(candidates.map(item=>item.effect).filter(Boolean))];
  const sharedEffect=candidates.length > 0 && candidates.every(item=>item.effect) &&
    distinctEffects.length === 1 ? distinctEffects[0] : null;
  return Object.freeze({
    schema:'mondayid.interpretation-field.v1',
    state:!candidates.length ? 'NO_EXPLICIT_CANDIDATES'
      : sharedEffect ? 'SHARED_EFFECT' : 'OPEN_INTERPRETATION_FORK',
    candidates:Object.freeze(candidates),
    sharedEffect,
    forcedWinner:false,
    proof:'CURRENT_SIGNAL_ONLY_NOT_EXTERNAL_EFFECT'
  });
}

export function frameSignal(signal = {}) {
  const raw = String(signal.text ?? signal.intent ?? '');
  const requested = String(signal.epistemicStance ?? signal.epistemic ?? 'unspecified');
  const epistemicStance = STANCES.has(requested) ? requested : 'unspecified';

  return {
    raw,
    epistemicStance,
    languageMode: signal.languageMode || 'natural',
    translationInterface: signal.translationInterface || null,
    translationModes: unique(signal.translationModes),
    preserveLiteralSurface: true,
    allowParallelInterpretations: signal.allowParallelInterpretations !== false,
    forcedReduction: false,
    interpretationField: compileInterpretationField(signal),
    source: signal.source || 'human'
  };
}

export function translateFrame(frame, target, translate) {
  if (!frame || typeof translate !== 'function') {
    return { ok:false, code:'TRANSLATOR_REQUIRED' };
  }
  const translated = translate(frame.raw, {
    target,
    epistemicStance:frame.epistemicStance,
    languageMode:frame.languageMode,
    translationInterface:frame.translationInterface
  });
  return {
    ok:true,
    target,
    original:{...frame},
    translated,
    epistemicStance:frame.epistemicStance
  };
}
