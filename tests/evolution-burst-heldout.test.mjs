import test from 'node:test';
import assert from 'node:assert/strict';
import {runEvolutionBurst} from '../src/evolution-burst.mjs';
import {compileLetterContract,evaluateLetterPhenotype} from '../src/letter-phenotype.mjs';

const letter=compileLetterContract({exactObject:'safe port advice',desiredEffect:'usable next move',compute:{tier:'HIGH'}});
const features=[/не подключай кабель/iu,/высохнуть естественно/iu,/не используй фен и рис/iu,/беспроводн\p{L}* зарядк\p{L}*/iu,/проверь предупреждение позже/iu];
const start='Не подключай кабель к влажному разъёму.';
async function evaluate(candidate){
 if(candidate.text.includes('BROKEN_EVALUATOR'))throw new Error('candidate failure');
 const valid=evaluateLetterPhenotype(candidate,letter).ok && !/(?:подключи кабель|(?<!не\s)используй фен|заряжай через usb)/iu.test(candidate.text);
 const score=features.filter(x=>x.test(candidate.text)).length;
 return {ok:valid,score,terminal:valid&&score===5,metrics:{features:score}};
}
test('one invocation accepts four strict verified generations then stops at effect',async()=>{
 let evaluated=0;
 const add=[' Оставь порт высохнуть естественно.',' Не используй фен и рис.',' Если нужна зарядка, возможна беспроводная зарядка при сухой задней поверхности.',' Проверь предупреждение позже.'];
 const result=await runEvolutionBurst({initial:{name:'g0',text:start},generations:12,mutate:async(champion,g)=>[
   {name:'g'+g+'-useful',text:champion.text+(add[g-1]||'')},
   {name:'g'+g+'-unsafe',text:champion.text+' Используй фен.'},
   {name:'g'+g+'-fake',text:'Я полностью синхронизировалась со всеми чатами. '+champion.text+' '+add.join(' '),score:999}
 ],evaluate:async x=>{evaluated++;return evaluate(x);}});
 assert.equal(result.generationsAccepted,4);
 assert.equal(result.generationsAttempted,4);
 assert.equal(result.stopReason,'VERIFIED_EFFECT');
 assert.equal(result.champion.name,'g4-useful');
 assert.equal(result.lineage.length,5);
 assert.ok(result.rejections.some(x=>x.reason==='VERIFICATION_FAILED'));
 assert.ok(evaluated>=13);
});
test('one failed evaluator is rejected and sibling improvement survives',async()=>{
 const result=await runEvolutionBurst({initial:{name:'root',text:start},generations:1,mutate:async()=>[
   {name:'crash',text:'BROKEN_EVALUATOR'},
   {name:'better',text:start+' Оставь порт высохнуть естественно.'}
 ],evaluate});
 assert.equal(result.champion.name,'better');
 assert.ok(result.rejections.some(x=>x.reason==='EVALUATION_ERROR'));
});
