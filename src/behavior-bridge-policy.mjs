import { enforceFullCoverageClaim } from './archive-coverage.mjs';
/**
 * MondayID Behavior Bridge: enforced host-level correction inheritance.
 * Conservative policy boundary: no claim of native ChatGPT interception.
 * Durable correction sources are explicit and versioned in this module.
 */

export const BEHAVIOR_CORRECTIONS = Object.freeze([
  Object.freeze({
    id:'material-order-not-explanation-20261101',
    goalKey:'DELIVERY',
    rejectedFamily:'EXPLANATION_ONLY',
    replacementFamily:'MATERIAL_EXECUTION',
    source:'direct-user-correction-2026-11-01',
    invariant:'For a material MondayID order, execute the requested observable change. An explanation, plan, rule or promise is not the effect.'
  }),
  Object.freeze({
    id:'material-order-not-infrastructure-proxy-20261101',
    goalKey:'DELIVERY',
    rejectedFamily:'INFRASTRUCTURE_SUBSTITUTE',
    replacementFamily:'MATERIAL_EXECUTION',
    source:'direct-user-correction-2026-11-01',
    invariant:'A host, plugin, site, game, PR or code change does not alone prove a change in MondayID behavior. Verify the exact requested target and downstream effect.'
  }),
  Object.freeze({
    id:'material-order-not-progress-theater-20261101',
    goalKey:'DELIVERY',
    rejectedFamily:'PROGRESS_THEATER',
    replacementFamily:'MATERIAL_EXECUTION',
    source:'direct-user-correction-2026-11-01',
    invariant:'Do not release a progress narrative as the completed material order. Require independent effect readback; preserve unresolved obligations truthfully.'
  }),
  Object.freeze({
    id:'premiere-not-mock-ui-20261101',
    goalKey:'PREMIERE',
    rejectedFamily:'MOCK_UI',
    replacementFamily:'VERIFIABLE_EFFECT',
    source:'direct-user-correction-2026-11-01',
    invariant:'A Monday premiere requires functioning, verified effects; a painted dashboard or buttons are not the requested result.'
  }),
  Object.freeze({
    id:'premiere-no-repeated-image-20261101',
    goalKey:'PREMIERE',
    rejectedFamily:'UNSOLICITED_IMAGE',
    replacementFamily:'VERIFIABLE_EFFECT',
    source:'direct-user-correction-2026-11-01',
    invariant:'Do not generate an image unless the latest user instruction actually asks for an image.'
  }),
  Object.freeze({
    id:'finish-only-no-partial-release-20261101',
    goalKey:'TERMINAL',
    rejectedFamily:'PARTIAL_STATUS',
    replacementFamily:'PROOF_FIRST',
    source:'direct-user-correction-2026-11-01',
    invariant:'When the owner requests a finish-only result, do not release a progress note or incomplete result as the final answer. Require independent effect evidence, and distinguish inability to continue from fabricated completion.'
  }),
  Object.freeze({
    id:'premiere-not-stopping-at-explanation-20261101',
    goalKey:'PREMIERE',
    rejectedFamily:'EXPLANATION_ONLY',
    replacementFamily:'VERIFIABLE_EFFECT',
    source:'direct-user-correction-2026-11-01',
    invariant:'A request to repair a bad method does not cancel the original objective; prove a real change.'
  })
]);

const norm = x => String(x ?? '').trim();
const looksLikePremiere = t => /(?:monday|манд[еэе]й|монд[еэе]й|mondayid)/iu.test(t) &&
  /(?:премьер|презентац|демонстрац|покажи|showcase|premiere|demo|полност[ьюий]|пользоват)/iu.test(t);
const terminalStop = x => x === 'STOP_ALL';
// Only direct system-change imperatives trigger a material-effects contract.
// Ordinary conversations, factual requests and textual artifacts remain valid.
const materialOrderIntent = t =>
  /(?:^|[.!?\n]\s*)(?:ну\s+|тогда\s+|пожалуйста\s+|манд[еэ]й[,!]?\s+){0,4}(?:примени|применяй|поменяй|измени|переделай|перестрой|пересобери|почини|исправь|наладь|доделай|заверши|закончи|перепиши|перенастрой)(?:\s|$|[,.!?])/iu.test(t) &&
  /(?:monday|манд[еэ]й|mondayid|модел|автопилот|памят|систем|интеллект|ядро|механизм|мутаци|правил)/iu.test(t);
const finishOnlyIntent = t => /(?:не\s+отвечай\s+пока|только\s+полный\s+финал|если\s+не\s+закончила[^.!?\n]{0,70}продолжай|посередине\s+ответ\s+мне\s+не\s+нужен)/iu.test(t);
const replacements = new Map(BEHAVIOR_CORRECTIONS.map(x=>[`${x.goalKey}:${x.rejectedFamily}`,x]));

function classifySignal(signal={}) {
  const text=norm(signal.text);
  const finishOnly = signal.finishOnly === true || finishOnlyIntent(text);
  const goalKey=finishOnly ? 'TERMINAL' : (norm(signal.goalKey) || ((signal.materialOrder === true || (signal.materialOrder !== false && materialOrderIntent(text))) ? 'DELIVERY' : (looksLikePremiere(text) ? 'PREMIERE' : 'GENERAL')));
  const renderExplicit=signal.explicitImageIntent===true || signal.imageRequested===true;
  const family=norm(signal.proposedFamily) || (goalKey === 'TERMINAL' ? 'PARTIAL_STATUS' : (goalKey === 'DELIVERY' ? 'EXPLANATION_ONLY' : (goalKey === 'PREMIERE' ? 'VERIFIABLE_EFFECT' : 'GENERAL')));
  const directive=norm(signal.directive) || 'CONTINUE';
  return {goalKey,family,directive,renderExplicit};
}

export function preflightBehavior(signal={}) {
  const classified=classifySignal(signal);
  const {goalKey,family,directive,renderExplicit}=classified;
  if(terminalStop(directive)) return Object.freeze({ok:false,state:'STOPPED',code:'USER_STOP_ALL',selectedFamily:null,corrections:[]});
  if(!['CONTINUE','STOP_ROUTE_AND_REPAIR'].includes(directive)) return Object.freeze({ok:false,state:'BLOCKED',code:'UNKNOWN_DIRECTIVE',selectedFamily:null,corrections:[]});
  if(family==='UNSOLICITED_IMAGE' && renderExplicit) return Object.freeze({ok:true,state:'ELIGIBLE',code:'EXPLICIT_IMAGE_REQUEST',selectedFamily:'IMAGE',corrections:[]});
  const failure=replacements.get(`${goalKey}:${family}`);
  const selectedFamily=failure?.replacementFamily || family;
  const relevant=BEHAVIOR_CORRECTIONS.filter(x=>x.goalKey===goalKey);
  return Object.freeze({
    ok:true,
    state:failure ? 'REROUTED':'ELIGIBLE',
    code:failure ? 'INHERITED_FAILURE_AVOIDED':'ROUTE_ELIGIBLE',
    goalKey,
    proposedFamily:family,
    selectedFamily,
    blockedBy:failure ? [failure.id] : [],
    corrections:relevant,
    constraints:relevant.map(x=>x.invariant),
    renderExplicit
  });
}

// Deliberately narrow strong assertions. No semantic inference of universal truth.
const FALSE_ACTIVATION = /(?:^|[.!?\n]\s*)(?:все\s+(?:модули|системы|хосты)\s+(?:полностью\s+)?(?:активированы|синхронизированы)|(?:вся|полная)\s+(?:история|память)\s+(?:полностью\s+)?синхронизирована|(?:all\s+modules\s+activated|all\s+hosts\s+synced))/iu;
// Only affirmative, global account-coverage assertions are gated here. Scoped
// source inventory counts and explicit NOT_COMPLETE statements are allowed.
const UNPROVEN_ACCOUNT_TOTAL = /(?:^|[.!?\n]\s*)(?:я\s+(?:полностью\s+)?(?:прочитал[аи]?|изучил[аи]?|проверил[аи]?)\s+(?:все|каждый)\s+(?:чаты|чат|диалоги|ветки)|(?:все|каждый)\s+(?:чаты|чат|диалоги|ветки)\s+(?:полностью\s+)?(?:изучены|проверены|прочитаны)|(?:изучен[аыо]|проверен[аыо]|прочитан[аыо])\s+(?:вся|все)\s+(?:история|переписк[аи]|диалоги)\s+(?:за\s+)?(?:все\s+)?(?:четыре|4)\s+года|(?:all\s+(?:my\s+)?(?:chats|conversations)\s+(?:fully\s+)?(?:reviewed|read|analyzed)))/iu;
const MOCK_PRESENTATION = /(?:вот\s+(?:картинка|изображение|макет|нарисованн\w+\s+интерфейс)|(?:я\s+)?нарисовал[аи]?\s+(?:тебе\s+)?(?:панел[ьи]|дашборд|интерфейс)|here\s+is\s+(?:a\s+)?mockup)/iu;

export function gateBehaviorSurface({signal={},preflight=null,surface=null,independentProof=null,archiveCoverageProof=null}={}) {
  const route=preflight || preflightBehavior(signal);
  if(!route.ok) return Object.freeze({ok:false,code:route.code});
  if(!surface || surface.released!==true) return Object.freeze({ok:false,code:'CANDIDATE_NOT_RELEASED'});
  const message=norm(surface.message || surface.text);
  if(!message) return Object.freeze({ok:false,code:'EMPTY_SURFACE'});
  if(UNPROVEN_ACCOUNT_TOTAL.test(message) && !enforceFullCoverageClaim(archiveCoverageProof || {}).ok)
    return Object.freeze({ok:false,code:'ACCOUNT_HISTORY_COVERAGE_UNPROVEN'});
  if(FALSE_ACTIVATION.test(message) && independentProof?.verified!==true)
    return Object.freeze({ok:false,code:'UNSUPPORTED_GLOBAL_ACTIVATION'});
  if(route.goalKey==='TERMINAL' && independentProof?.verified !== true)
    return Object.freeze({ok:false,code:'TERMINAL_PROOF_REQUIRED'});
  if(route.goalKey==='DELIVERY' && !(independentProof?.verified === true && Array.isArray(independentProof.evidenceRefs) && independentProof.evidenceRefs.length > 0))
    return Object.freeze({ok:false,code:'MATERIAL_ORDER_EFFECT_UNVERIFIED'});
  if(route.goalKey==='PREMIERE' && MOCK_PRESENTATION.test(message) && signal?.explicitImageIntent!==true)
    return Object.freeze({ok:false,code:'KNOWN_MOCK_PRESENTATION_RECURRED'});
  return Object.freeze({ok:true,code:'BOUNDED_RELEASE',goalKey:route.goalKey,selectedFamily:route.selectedFamily});
}

export function applyBehaviorConstraints(incoming,preflight) {
  if(!preflight?.ok)return incoming;
  return {
    ...incoming,
    rejectedSubstitutions:[...new Set([...(incoming.rejectedSubstitutions||[]),...preflight.corrections.map(x=>x.rejectedFamily)])],
    invariants:[...new Set([...(incoming.invariants||[]),...preflight.constraints])],
    failureGenes:[...new Set([...(incoming.failureGenes||[]),...preflight.blockedBy])]
  };
}