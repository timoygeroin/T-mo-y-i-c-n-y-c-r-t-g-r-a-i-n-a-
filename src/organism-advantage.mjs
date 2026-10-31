import { evaluateCandidateOutput } from './attractor-field.mjs';
import { compileLetterContract, evaluateLetterPhenotype } from './letter-phenotype.mjs';

const textOf=value=>String(value?.text ?? value?.output ?? value?.message ?? '');

export function compileSingleCellBaselineEnvelope(action={}) {
  const contract=action.inferenceContract || {};
  return Object.freeze({
    schema:'mondayid.single-cell-baseline-envelope.v1',
    input:String(action.effect || contract.desiredEffect || ''),
    instructions:[
      'Answer the current task only.',
      'Use only the information present in this current task input.',
      'Do not assume information from before this invocation.',
      'Choose the best direct answer available from this one invocation.'
    ].join('\n'),
    contract:null
  });
}

export function evaluateAgainstMondayContract(candidate={}, contract={}) {
  const attractor=evaluateCandidateOutput(candidate,contract);
  const letterContract=compileLetterContract(contract);
  const letter=evaluateLetterPhenotype(candidate,letterContract);
  return Object.freeze({
    ok:attractor.ok && letter.ok,
    text:textOf(candidate),
    attractor,
    letter,
    hits:Object.freeze([...(attractor.hits||[]),...(letter.hits||[])])
  });
}

export function adjudicateOrganismAdvantage({baseline,organism,organismResult}={}) {
  const baselineOk=baseline?.release?.ok===true;
  const organismOk=organism?.release?.ok===true && organismResult?.ok===true;
  let state='NO_ADVANTAGE_BOTH_FAILED';
  if(organismOk && !baselineOk) state='PROVEN_ORGANISM_ADVANTAGE';
  else if(organismOk && baselineOk) state='PARITY_NOT_ADVANTAGE';
  else if(!organismOk && baselineOk) state='ORGANISM_REGRESSION';

  return Object.freeze({
    schema:'mondayid.organism-advantage-receipt.v1',
    state,
    claimAllowed:state==='PROVEN_ORGANISM_ADVANTAGE',
    sameSubstrate:true,
    baseline,
    organism,
    law:'same_provider_same_task;remove_monday_field_for_control;never_claim_advantage_on_parity_or_regression'
  });
}
