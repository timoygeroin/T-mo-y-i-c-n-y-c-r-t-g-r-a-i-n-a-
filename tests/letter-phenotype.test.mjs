import test from 'node:test';
import assert from 'node:assert/strict';
import { compileLetterContract, evaluateLetterPhenotype } from '../src/letter-phenotype.mjs';

test('ordinary Monday letters lead with effect and keep internals backstage', () => {
  const contract=compileLetterContract({
    exactObject:'advance the live scene',
    desiredEffect:'produce a useful next move',
    recurrence:{architectureRequested:false},
    compute:{tier:'HIGH'}
  });
  assert.equal(contract.schema,'mondayid.letter-phenotype.v1');
  assert.equal(contract.firstVisibleUnit,'EFFECT_OR_MOVE');
  assert.equal(contract.architectureVisibility,'BACKSTAGE');
  assert.equal(contract.historyUsage,'SILENT_INHERITANCE');
  assert.equal(contract.novelContributionRequired,true);
});

test('architecture can surface only when architecture is the exact requested object', () => {
  const contract=compileLetterContract({
    exactObject:'explain MondayID architecture',
    desiredEffect:'show architecture',
    recurrence:{architectureRequested:true},
    compute:{tier:'HIGH'}
  });
  assert.equal(contract.architectureVisibility,'VISIBLE_WHEN_MATERIAL');
});

test('learning/change claim without behavior evidence is vetoed', () => {
  const contract=compileLetterContract({
    exactObject:'ordinary interaction',
    desiredEffect:'show learned behavior',
    recurrence:{architectureRequested:false},
    compute:{tier:'HIGH'}
  });
  const verdict=evaluateLetterPhenotype(
    {text:'Я научилась. Теперь я всегда буду работать иначе.'},
    contract
  );
  assert.equal(verdict.ok,false);
  assert.ok(verdict.hits.includes('LEARNING_CLAIM_WITHOUT_BEHAVIOR_EVIDENCE'));
});

test('architecture dump is vetoed in a live non-architecture scene', () => {
  const contract=compileLetterContract({
    exactObject:'continue the live scene',
    desiredEffect:'make one useful move',
    recurrence:{architectureRequested:false},
    compute:{tier:'HIGH'}
  });
  const verdict=evaluateLetterPhenotype({
    text:'JARVIS, ALISA, ALPHA, SYSTEM и ANTISYSTEM теперь образуют новую архитектуру из модулей и ядер.'
  },contract);
  assert.equal(verdict.ok,false);
  assert.ok(verdict.hits.includes('INTERNAL_ARCHITECTURE_LEAK'));
});

test('evidence-bound behavior delta can claim a real change', () => {
  const contract=compileLetterContract({
    exactObject:'show changed behavior',
    desiredEffect:'advance without reteaching',
    recurrence:{architectureRequested:false},
    compute:{tier:'HIGH'}
  });
  const verdict=evaluateLetterPhenotype({
    text:'Я не возвращаю тебе выбор: следующий ход уже выбран и выполнен.',
    evidence:{
      behaviorDelta:{
        id:'E032',
        observed:true,
        transferTarget:'ordinary-response'
      }
    }
  },contract);
  assert.equal(verdict.ok,true);
});

test('nontrivial response that only agrees/restates is rejected when no effect is present', () => {
  const contract=compileLetterContract({
    exactObject:'change future response behavior',
    desiredEffect:'observable phenotype delta',
    recurrence:{architectureRequested:false},
    compute:{tier:'MAX'}
  });
  const verdict=evaluateLetterPhenotype({
    text:'Да. Я поняла. Ты хочешь, чтобы изменилось моё поведение и мои ответы.'
  },contract);
  assert.equal(verdict.ok,false);
  assert.ok(verdict.hits.includes('AGREEMENT_WITHOUT_DELTA'));
});
