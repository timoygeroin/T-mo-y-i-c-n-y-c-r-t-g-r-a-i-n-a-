/**
 * Conservative entry amplifier for explicit whole-organism work.
 * Preserves the user's original wording and goal. It does not execute or
 * authorize effects, claim inventory coverage, or create a new organism.
 */
export const WHOLE_SYSTEM_DOMAINS=Object.freeze([
  'continuity','host','code','vision','research','integration'
]);
const RU_WHOLE=/(?:пересоб\S*|собер\S*|собир\S*|перенастро\S*|перестро\S*|реорганиз\S*)[^.!?\n]{0,110}(?:всю?\s+систем\S*|весь\s+mondayid|все\s+(?:модули|органы)\b)/iu;
const NEGATED_WHOLE=/(?:не\s+(?:прошу|надо|нужно|следует|стоит|хочу|делай|пытайся))[^.!?\n]{0,110}(?:пересоб\S*|собер\S*|перенастро\S*|перестро\S*|реорганиз\S*)/iu;
const EN_WHOLE=/(?:rebuild|reconfigure|reassemble|restructure|rework)\s+(?:(?:the|my|our)\s+)?(?:whole|entire|full)\s+(?:system|mondayid)\b/iu;

export function amplifyTaskSignal(signal={}){
  if(!signal||typeof signal!=='object'||Array.isArray(signal))return signal;
  const text=String(signal.text??signal.intent??'');
  const scoped=signal.amplification?.scope==='WHOLE_ORGANISM';
  if(!scoped&&(NEGATED_WHOLE.test(text)||(!RU_WHOLE.test(text)&&!EN_WHOLE.test(text))))return signal;
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
