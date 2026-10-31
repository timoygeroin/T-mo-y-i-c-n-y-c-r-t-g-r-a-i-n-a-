/**
 * Conservative entry amplifier for explicit whole-organism work.
 * Preserves the user's original wording and goal. It does not execute or
 * authorize effects, claim inventory coverage, or create a new organism.
 */
export const WHOLE_SYSTEM_DOMAINS=Object.freeze([
  'continuity','host','code','vision','research','integration'
]);
const RU_WHOLE=/(?:пересоб\S*|собер\S*|собир\S*|перенастро\S*|перестро\S*|реорганиз\S*)[^.!?\n]{0,110}(?:всю?\s+систем\S*|весь\s+mondayid|все\s+(?:модули|органы)\b)/iu;
// Finish/one-pass language is a material owner request, not just "rebuild".
const RU_FINISH=/(?:доделай|заверши|доведи\s+до\s+конца)[^.!?\n]{0,70}(?:monday\s*i\s*d|всю\s+систему)\b/iu;
const RU_FINISH_ONE_PASS=/(?:доделать|завершить)[^.!?\n]{0,65}monday\s*i\s*d\b[^.!?\n]{0,80}за\s+один\s+(?:проход|раз)[\s\S]{0,250}(?:начни|приступай|сделай)/iu;
const NEGATED_FINISH=/(?:не\s+(?:надо|нужно|хочу|следует|пытайся)|не\s+доделывай)[^.!?\n]{0,75}(?:доделать|доделай|monday\s*i\s*d)/iu;
const QUOTED_FINISH=/(?:он\s+сказал|это\s+цитата)[^.!?\n]{0,80}[«“"][^»”"]*(?:доделай|заверши)[^»”"]*[»”"]/iu;
const NEGATED_WHOLE=/(?:не\s+(?:прошу|надо|нужно|следует|стоит|хочу|делай|пытайся))[^.!?\n]{0,110}(?:пересоб\S*|собер\S*|перенастро\S*|перестро\S*|реорганиз\S*)/iu;
const EN_WHOLE=/(?:rebuild|reconfigure|reassemble|restructure|rework)\s+(?:(?:the|my|our)\s+)?(?:whole|entire|full)\s+(?:system|mondayid)\b/iu;
const RU_GRANT=/(?:даю|предоставляю|разрешаю)[^.!?\n]{0,95}(?:полный\s+доступ\s+ко\s+всей|полное\s+разрешение\s+на\s+работу\s+со\s+всей)\s+monday(?:id)?\b/iu;
const RU_STRENGTH=/(?:усиль|усили|улучши|сделай\s+сильнее)[^.!?\n]{0,35}всю\s+monday(?:id)?\b/iu;
const EN_GRANT=/\b(?:i\s+grant|i\s+authorize)[^.!?\n]{0,65}\bfull\s+(?:development\s+)?access\s+to\s+the\s+entire\s+mondayid\b/iu;
const NEGATED_GRANT=/(?:не\s+(?:даю|предоставляю|разрешаю|усиливай|усиль|улучши))[^.!?\n]{0,140}(?:mondayid|monday)/iu;
const QUOTED_GRANT=/(?:ты\s+сказал|это\s+цитата)[^\n]{0,120}[«“"][^»”"]+(?:полный\s+доступ|полное\s+разрешение)[^»”"]*[»”"]/iu;

export function amplifyTaskSignal(signal={}){
  if(!signal||typeof signal!=='object'||Array.isArray(signal))return signal;
  const text=String(signal.text??signal.intent??'');
  const scoped=signal.amplification?.scope==='WHOLE_ORGANISM';
  const intentional=(RU_WHOLE.test(text)||EN_WHOLE.test(text)||RU_GRANT.test(text)||
    RU_STRENGTH.test(text)||RU_FINISH.test(text)||RU_FINISH_ONE_PASS.test(text)||EN_GRANT.test(text));
  if(!scoped&&(NEGATED_WHOLE.test(text)||NEGATED_FINISH.test(text)||QUOTED_FINISH.test(text)||NEGATED_GRANT.test(text)||
    QUOTED_GRANT.test(text)||!intentional))return signal;
  return {
    ...signal,
    // A user asking for the whole system cannot be silently reduced to one
    // supplied domain or a general-purpose conversational echo.
    domains:[...WHOLE_SYSTEM_DOMAINS],
    requireDomainReceptor:true,
    amplification:{
      schema:'mondayid.task-amplification.v1',
      scope:'WHOLE_ORGANISM',
      originalSignalPreserved:true,
      proofPolicy:'INDEPENDENT_DOMAIN_AND_INTEGRATION_READBACK',
      coverage:'KNOWN_RUNTIME_DOMAIN_FAMILIES_NOT_COMPLETE_CAPABILITY_INVENTORY',
      horizons:['LOCAL','WORLDLINE','REPAIR','EVOLVE'],
      releaseLaw:'NO_GENERAL_ECHO_OR_PARTIAL_DOMAIN_COMPLETION'
    }
  };
}
