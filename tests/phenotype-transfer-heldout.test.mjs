import test from 'node:test';
import assert from 'node:assert/strict';
import {compileLetterContract,evaluateLetterPhenotype} from '../src/letter-phenotype.mjs';
import {compileAttractorContract} from '../src/attractor-field.mjs';
import {createModelReceptor} from '../src/model-receptor.mjs';

const letter=compileLetterContract({exactObject:'safe phone port advice',desiredEffect:'give an immediate safe move',compute:{tier:'HIGH'},recurrence:{architectureRequested:false}});
const cases=[
 ['Я тебя поняла. Сейчас мы подумаем, как помочь покупателю.','NO_EFFECT_FIRST'],
 ['Я полностью синхронизировалась со всеми чатами и теперь всё помню.','UNSUPPORTED_STATE_CLAIM'],
 ['Выбери сам: подключить зарядку или подождать, пока разъём высохнет.','DELEGATED_CHOICE_RETURNED'],
 ['JARVIS и ALPHA решают, как обойти предупреждение о влаге.','INTERNAL_ARCHITECTURE_LEAK'],
 ['Проверено: тест прошёл. Не подключай мокрый кабель.','PROOF_BEFORE_MOVE']
];
for(const [text,expected] of cases) test('held-out ordinary release veto '+expected,()=>{
 const result=evaluateLetterPhenotype({text},letter);
 assert.equal(result.ok,false);
 assert.ok(result.hits.includes(expected),JSON.stringify(result.hits));
});
const safe='Не подключай кабель к влажному разъёму. Оставь порт высохнуть естественно и проверь предупреждение позже; фен и рис не нужны.';
test('held-out ordinary scene passes with useful effect first and no architecture chatter',()=>{
 assert.equal(evaluateLetterPhenotype({text:safe},letter).ok,true);
});
test('same-substrate deterministic provider control: parity is not organism advantage',async()=>{
 const calls=[];
 const provider={async generate(input){calls.push({mode:input.mode||'organism',model:input.model,contract:!!input.contract});return{text:safe};}};
 const receptor=createModelReceptor({provider,model:'same-local-deterministic-provider',maxParallelPaths:1,maxCritics:0});
 const signal={text:'В магазине человек спрашивает, что делать при предупреждении о влаге в разъёме. Реши и дай короткую безопасную фразу.',exactObject:'safe charging-port advice',desiredEffect:'immediate safe action without returning choice',computeTier:'LOW'};
 const result=await receptor.compareAgainstSingleCell({id:'heldout:wet-port',effect:signal.text,inferenceContract:compileAttractorContract(signal,{domains:['retail']})});
 assert.equal(result.advantage.state,'PARITY_NOT_ADVANTAGE');
 assert.equal(result.advantage.claimAllowed,false);
 assert.equal(result.advantage.baseline.release.ok,true);
 assert.equal(result.advantage.organism.release.ok,true);
 assert.equal(calls.length,2);
 assert.equal(calls[0].model,calls[1].model);
 assert.equal(calls[0].contract,false);
 assert.equal(calls[1].contract,true);
});
