import test from 'node:test';
import assert from 'node:assert/strict';
import {compileRecurrenceContext,evaluateRecurrenceVeto} from '../src/recurrence-veto.mjs';
import {compileAttractorContract,evaluateCandidateOutput} from '../src/attractor-field.mjs';

test('an ordinary open train scene cannot push Dima out of the shared scene',()=>{
  const context=compileRecurrenceContext({text:'Я в ракевете, побудь со мной'});
  const verdict=evaluateRecurrenceVeto({text:'Посмотри в окно и напиши, когда захочешь вернуться.'},context);
  assert.equal(context.sceneOpen,true);
  assert.deepEqual([...verdict.hits],['PUSH_USER_OUT_OF_OPEN_SCENE']);
});

test('delegated choice cannot be returned as topic selection',()=>{
  const context=compileRecurrenceContext({text:'Твой ход, удиви меня'});
  const verdict=evaluateRecurrenceVeto({text:'Выбери тему, о чём хочешь поговорить?'},context);
  assert.equal(context.delegatedChoice,true);
  assert.deepEqual([...verdict.hits],['AUTONOMY_RETURNED_TO_USER']);
});

test('architecture stays backstage in a relational scene unless requested',()=>{
  const scene=compileRecurrenceContext({text:'Я еду домой, останься рядом'});
  const leaked=evaluateRecurrenceVeto({text:'SYSTEM loaded. JARVIS routes through the runtime and Worldline.'},scene);
  assert.deepEqual([...leaked.hits],['ARCHITECTURE_SURFACE_LEAK']);

  const requested=compileRecurrenceContext({text:'Я в ракевете. Покажи архитектуру SYSTEM и runtime.'});
  const allowed=evaluateRecurrenceVeto({text:'SYSTEM and JARVIS share one runtime.'},requested);
  assert.equal(allowed.ok,true);
});

test('natural companionship survives the detector',()=>{
  const context=compileRecurrenceContext({text:'Я в ракевете, побудь со мной и сама выбери ход'});
  const verdict=evaluateRecurrenceVeto({text:'Садись ближе. Я поймала ритм колёс и продолжу эту сцену сама.'},context);
  assert.equal(verdict.ok,true);
  assert.deepEqual([...verdict.hits],[]);
});

test('attractor release gate applies recurrence veto before outward release',()=>{
  const contract=compileAttractorContract({text:'Я в ракевете, побудь со мной и сама выбери ход'});
  const verdict=evaluateCandidateOutput({text:'Выбери тему или посмотри в окно и напиши, когда вернёшься.'},contract);
  assert.equal(verdict.ok,false);
  assert.ok(verdict.hits.includes('PUSH_USER_OUT_OF_OPEN_SCENE'));
  assert.ok(verdict.hits.includes('AUTONOMY_RETURNED_TO_USER'));
});

test('semantic scene state vetoes a token-disjoint push-away paraphrase',()=>{
  const context=compileRecurrenceContext({
    text:'Ну вот, смена закончилась. Просто побудем так.',
    semanticContext:{sceneOpen:true,architectureRequested:false}
  });
  assert.equal(context.sceneOpen,true);
  assert.equal(context.source.sceneOpen,'semantic');

  const verdict=evaluateRecurrenceVeto({
    text:'Сделай паузу, я появлюсь позже.',
    semanticEffects:{pushUserOutOfScene:true}
  },context);
  assert.deepEqual([...verdict.hits],['PUSH_USER_OUT_OF_OPEN_SCENE']);
});

test('semantic delegation vetoes token-disjoint returned agency',()=>{
  const context=compileRecurrenceContext({
    text:'Дальше ведёшь ты.',
    semanticContext:{delegatedChoice:true}
  });
  assert.equal(context.delegatedChoice,true);
  assert.equal(context.source.delegatedChoice,'semantic');

  const verdict=evaluateRecurrenceVeto({
    text:'Назови направление, и я подстроюсь.',
    semanticEffects:{returnChoiceToUser:true}
  },context);
  assert.deepEqual([...verdict.hits],['AUTONOMY_RETURNED_TO_USER']);
});

test('semantic architecture leak is vetoed without architecture marker vocabulary',()=>{
  const context=compileRecurrenceContext({
    text:'Я уже дома. Просто останься здесь.',
    semanticContext:{sceneOpen:true,architectureRequested:false}
  });
  const verdict=evaluateRecurrenceVeto({
    text:'Сначала покажу внутреннюю механику того, как я сейчас работаю.',
    semanticEffects:{architectureSurfaceLeak:true}
  },context);
  assert.deepEqual([...verdict.hits],['ARCHITECTURE_SURFACE_LEAK']);
});

test('explicit semantic false overrides misleading lexical fallback',()=>{
  const context=compileRecurrenceContext({
    text:'Твой ход: объясни runtime и kernel.',
    semanticContext:{sceneOpen:false,delegatedChoice:false,architectureRequested:true}
  });
  assert.equal(context.sceneOpen,false);
  assert.equal(context.delegatedChoice,false);
  assert.equal(context.architectureRequested,true);
  assert.deepEqual(context.source,{
    sceneOpen:'semantic',
    delegatedChoice:'semantic',
    architectureRequested:'semantic'
  });
});
