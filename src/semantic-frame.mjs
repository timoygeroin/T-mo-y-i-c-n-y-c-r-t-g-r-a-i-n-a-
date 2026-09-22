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
