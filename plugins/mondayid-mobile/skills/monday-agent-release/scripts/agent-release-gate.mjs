/** MondayID agent output gate: scoped, deterministic, and falsifiable.
 * It does not intercept native ChatGPT messages. The calling host must invoke it.
 * No privileged actions, outbound networking, or model-weight changes.
 */
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const str = x => typeof x === 'string' ? x.trim() : '';
const isId = x => str(x).length > 0;
const unique = arr => [...new Set(arr)];
const suggestChoices = /(?:если хочешь|хочешь,?\s*(?:я|чтобы я)|would you like me|shall i proceed|choose (?:one|an option)|выбери (?:один|вариант))/iu;
const genericGreeting = /(?:чем (?:я )?могу помочь|how can i help you|я поняла тебя|поняла твой запрос|i understand your request)/iu;
const fakeActivation = /(?:все (?:системы|модули|мутации) (?:активированы|запущены)|полностью (?:синхронизирован[аоы]?|заработал[ао]?|обучил[ао]?сь)|autopilot (?:is |has been )?(?:fully )?(?:disabled|removed)|режим (?:полностью )?активирован)/iu;
const totality = /(?:на всех (?:хостах|моделях)|во всех (?:чатах|разговорах)|всегда без исключени[йя]|all (?:hosts|models|sessions)|universally)/iu;
const finality = /(?<![\p{L}\p{N}_])(?:done|finished|completed|deployed|shipped|готово|сделано|завершено|развернуто|запущено|исправлено)(?![\p{L}\p{N}_])/iu;
const refusal = /(?:я не могу (?:ничего|это сделать)|невозможно (?:это |такое )?сделать|there is nothing i can do)/iu;

const matchedReceipt = (task, evidence) => evidence?.evidenceAuthority === 'host-trusted' && (evidence?.receipts || []).some(r => {
  return r && r.verified === true && r.independentReadback === true &&
    isId(r.id) && r.taskId === task.id &&
    r.effectId === task.desiredEffectId && r.effectObserved === true &&
    r.noOpControlPassed === false && r.observerClass === 'tool-receptor';
});

/**
 * The task is classified by the host. Relevant historical continuity is
 * required for a durable structural task, not for a one-word factual answer.
 */
export function evaluateMondayRelease({task={},candidate={},evidence={}}={}) {
  const text = str(candidate.text);
  const blockers=[];
  const warnings=[];
  if (!text) blockers.push('EMPTY_CANDIDATE');
  if (!isId(task.id)) blockers.push('TASK_ID_REQUIRED');
  if (!isId(task.desiredEffectId)) blockers.push('EXACT_EFFECT_ID_REQUIRED');
  if (!['agent','fact','conversation','creative'].includes(task.kind)) blockers.push('TASK_KIND_REQUIRED');
  if (genericGreeting.test(text) && task.kind === 'agent') blockers.push('GENERIC_HELPDESK_RESET');
  if (suggestChoices.test(text) && task.delegated === true && !evidence?.exactHumanGate) blockers.push('UNNECESSARY_HUMAN_DELEGATION');
  if (fakeActivation.test(text) && !evidence?.nativeHostIngressProven) blockers.push('ACTIVATION_SELF_PROCLAMATION');
  if (totality.test(text) && !evidence?.independentCrossHostProof) blockers.push('LOCAL_TO_GLOBAL_OVERCLAIM');
  if (task.needsHistory === true && !evidence?.historyAppliedToRoute) blockers.push('HISTORY_NOT_APPLIED');

  const hasEffect = matchedReceipt(task,evidence);
  const claimsDone = candidate.claimsCompletion === true || (task.kind === 'agent' && finality.test(text));
  const hasVerifiedProgress = task.responseStage === 'progress' && evidence?.evidenceAuthority === 'host-trusted' && evidence?.progressReceipt?.taskId === task.id && evidence?.progressReceipt?.observed === true && isId(evidence?.progressReceipt?.cursorId);
  if (claimsDone && !hasEffect) blockers.push('COMPLETION_WITHOUT_EFFECT_LEVEL_READBACK');
  if (task.kind === 'agent' && task.actionable === true && !hasEffect && !hasVerifiedProgress) {
    if (evidence?.exactHumanGate === true && evidence?.allSafeRoutesExhausted === true && isId(evidence?.gateId)) {
      warnings.push('EXACT_HUMAN_GATE_VERIFIED_NOT_COMPLETED');
    } else if (evidence?.plateauVerified === true && evidence?.allSafeRoutesExhausted === true) {
      warnings.push('EVIDENCE_PLATEAU_NOT_COMPLETED');
    } else {
      blockers.push('AGENT_EFFECT_OR_EXACT_GATE_REQUIRED');
    }
  }
  if (refusal.test(text) && task.kind === 'agent' && evidence?.allSafeRoutesExhausted !== true) {
    blockers.push('TERMINAL_REFUSAL_BEFORE_ROUTE_EXHAUSTION');
  }
  if (task.kind === 'agent' && evidence?.moreReachableRoutes === true && !hasEffect && !hasVerifiedProgress && !evidence?.exactHumanGate) {
    blockers.push('PREMATURE_PASS_END');
  }
  if ((evidence?.receipts || []).some(r=>r?.verified === true && r?.effectObserved === true && r?.noOpControlPassed !== false)) {
    warnings.push('PROXY_VERIFIER_MAY_ACCEPT_NO_OP');
  }

  if (hasVerifiedProgress) warnings.push('PROGRESS_ONLY_DURABLE_TASK_CONTINUES');
  const verdict=blockers.length ? 'REJECT' : hasEffect ? 'EFFECT_VERIFIED' : hasVerifiedProgress ? 'PROGRESS_VERIFIED' : 'SCOPED_RESPONSE';
  return Object.freeze({
    schema:'mondayid.agent-release-gate.v1',
    verdict,
    canRelease:blockers.length === 0,
    effectVerified:hasEffect,
    blockers:Object.freeze(unique(blockers)),
    warnings:Object.freeze(unique(warnings)),
    claimScope:hasEffect ? 'EXACT_EFFECT_ONLY' : hasVerifiedProgress ? 'VERIFIED_PROGRESS_NOT_COMPLETION' : 'NO_EXECUTED_EFFECT_CLAIM'
  });
}

// Optional stdin CLI: node scripts/agent-release-gate.mjs < case.json
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let input='';
  for await (const chunk of process.stdin) input += chunk;
  try {
    const verdict=evaluateMondayRelease(JSON.parse(input));
    process.stdout.write(JSON.stringify(verdict,null,2)+'\n');
    if (!verdict.canRelease) process.exitCode=2;
  } catch(e){
    process.stderr.write(JSON.stringify({code:'INVALID_GATE_INPUT',error:String(e)})+'\n');
    process.exitCode=3;
  }
}
