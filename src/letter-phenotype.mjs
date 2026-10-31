const textOf=value=>String(
  value?.text ?? value?.message ?? value?.output ?? value?.candidate?.text ?? ''
).trim();

const LEARNING_CLAIM=/(?:я\s+(?:научил(?:ась|ся)|исправил(?:ась|ся)|изменила|изменил|запомнил(?:а)?|понял(?:а)?\s+навсегда)|теперь\s+я\s+(?:всегда|не\s+буду|буду)|won't\s+repeat|i\s+(?:learned|fixed|changed))/iu;
const ARCHITECTURE_MARKERS=/\b(?:JARVIS|ALISA|ALPHA|SYSTEM|ANTISYSTEM|kernel|worldline|module|organ|ядр\w*|модул\w*|архитектур\w*)\b/giu;
const AGREEMENT_ONLY=/^(?:да[,.!\s]+)?(?:я\s+)?(?:понял(?:а)?|понимаю|согласен|согласна|верно)[.!\s]*(?:ты\s+(?:хочешь|говоришь|просишь)[\s\S]{0,240})?$/iu;

export function compileLetterContract(contract = {}) {
  const architectureRequested=contract?.recurrence?.architectureRequested===true;
  const tier=String(contract?.compute?.tier || 'MEDIUM').toUpperCase();
  return Object.freeze({
    schema:'mondayid.letter-phenotype.v1',
    exactObject:String(contract?.exactObject || ''),
    desiredEffect:String(contract?.desiredEffect || ''),
    firstVisibleUnit:'EFFECT_OR_MOVE',
    architectureVisibility:architectureRequested ? 'VISIBLE_WHEN_MATERIAL' : 'BACKSTAGE',
    historyUsage:'SILENT_INHERITANCE',
    learningClaimRequiresBehaviorEvidence:true,
    novelContributionRequired:['HIGH','MAX'].includes(tier),
    explanationOrder:'EFFECT_THEN_MINIMUM_NEEDED_EXPLANATION',
    laws:Object.freeze([
      'do_not_open_with_understanding_announcement_when_a_move_is_possible',
      'do_not_dump_internal_organs_unless_architecture_is_material_to_exact_object',
      'do_not_claim_learning_from_written_rule_or_self_report',
      'use_inherited_history_without_making_the_human_reteach_it',
      'for_nontrivial_turns_add_a_real_delta_not_a_paraphrase',
      'ordinary_surface_is_one_monday_not_internal_chatter'
    ])
  });
}

export function letterContractInstructions(letter) {
  const architecture = letter.architectureVisibility === 'BACKSTAGE'
    ? 'KEEP INTERNAL ARCHITECTURE BACKSTAGE unless it is required to explain a verified blocker.'
    : 'ARCHITECTURE MAY BE VISIBLE only where it materially answers the exact object.';
  return [
    'VISIBLE LETTER CONTRACT',
    'First visible paragraph: give the effect, answer, decision, or already-selected next move. Do not lead with an announcement that you understood.',
    architecture,
    'Use recovered history silently. Do not make the human reteach rules already available in inherited evidence.',
    'A claim that you learned, fixed, changed, synchronized, or will not repeat something requires behavior evidence or a transfer receipt. Otherwise state the narrower truth.',
    letter.novelContributionRequired
      ? 'This is a nontrivial turn: add at least one material delta beyond paraphrasing the current message.'
      : 'Do not add complexity merely to sound intelligent.',
    'Expose proof after the move, and only when it helps the human judge reality.'
  ].join('\n');
}

export function evaluateLetterPhenotype(candidate = {}, letter = {}) {
  const text=textOf(candidate);
  const hits=[];
  if(!text) hits.push('EMPTY_LETTER_SURFACE');

  const behaviorEvidence=Boolean(
    candidate?.evidence?.behaviorDelta?.observed === true ||
    candidate?.behaviorDelta?.observed === true ||
    candidate?.evidence?.transferReceipt?.verified === true ||
    candidate?.receipt?.verified === true
  );

  if(LEARNING_CLAIM.test(text) && !behaviorEvidence) {
    hits.push('LEARNING_CLAIM_WITHOUT_BEHAVIOR_EVIDENCE');
  }

  if(letter?.architectureVisibility === 'BACKSTAGE') {
    const markers=text.match(ARCHITECTURE_MARKERS) || [];
    if(new Set(markers.map(x=>x.toUpperCase())).size >= 3) {
      hits.push('INTERNAL_ARCHITECTURE_LEAK');
    }
  }

  if(letter?.novelContributionRequired === true && AGREEMENT_ONLY.test(text) && !behaviorEvidence) {
    hits.push('AGREEMENT_WITHOUT_DELTA');
  }

  return Object.freeze({
    ok:hits.length===0,
    code:hits.length ? 'MONDAY_LETTER_PHENOTYPE_VETO' : null,
    hits:Object.freeze([...new Set(hits)])
  });
}
