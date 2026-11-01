import test from 'node:test';
import assert from 'node:assert/strict';
import { frameSignal, translateFrame } from '../src/semantic-frame.mjs';
import { compileSignals } from '../src/compiler.mjs';

test('semantic framing preserves a nonstandard translation language without reducing it', () => {
  const signal = {
    id:'magic-language',
    text:'mystical probability language',
    epistemicStance:'hypothesis',
    languageMode:'magical-translation-interface',
    translationInterface:'world-perception',
    translationModes:['physics','religion','mathematics','psychology']
  };
  const frame = frameSignal(signal);
  assert.equal(frame.raw,signal.text);
  assert.equal(frame.epistemicStance,'hypothesis');
  assert.equal(frame.languageMode,'magical-translation-interface');
  assert.equal(frame.forcedReduction,false);
  assert.equal(frame.allowParallelInterpretations,true);
  assert.deepEqual(frame.translationModes,signal.translationModes);
});

test('belief, hypothesis and claimed knowledge remain distinct states', () => {
  assert.notEqual(frameSignal({text:'x',epistemicStance:'belief'}).epistemicStance,
                  frameSignal({text:'x',epistemicStance:'hypothesis'}).epistemicStance);
  assert.notEqual(frameSignal({text:'x',epistemicStance:'hypothesis'}).epistemicStance,
                  frameSignal({text:'x',epistemicStance:'claimed-knowledge'}).epistemicStance);
});

test('translation carries epistemic stance instead of silently upgrading it', () => {
  const frame = frameSignal({text:'x',epistemicStance:'belief',languageMode:'angel-language'});
  const out = translateFrame(frame,'mathematics',(raw,meta)=>({raw,meta}));
  assert.equal(out.ok,true);
  assert.equal(out.epistemicStance,'belief');
  assert.equal(out.translated.meta.epistemicStance,'belief');
});

test('compiler carries semantic frame into both signal and objectives', () => {
  const graph = compileSignals([{
    id:'u',
    text:'research quantum language',
    epistemicStance:'hypothesis',
    languageMode:'translation-interface'
  }]);
  const signal = graph.nodes.find(node=>node.type==='signal');
  const objective = graph.nodes.find(node=>node.type==='objective');
  assert.equal(signal.semanticFrame.epistemicStance,'hypothesis');
  assert.equal(signal.semanticFrame.languageMode,'translation-interface');
  assert.deepEqual(objective.semanticFrame,signal.semanticFrame);
});


test('shared effect is compiled without choosing a favored metaphor or inventing external proof', () => {
  const frame=frameSignal({text:'Integrate MondayID',interpretations:[
    {id:'a',meaning:'continue existing organism',effect:'update existing MondayID'},
    {id:'b',meaning:'connect the active runtime',effect:'update existing MondayID'}
  ]});
  assert.equal(frame.interpretationField.state,'SHARED_EFFECT');
  assert.equal(frame.interpretationField.sharedEffect,'update existing MondayID');
  assert.equal(frame.interpretationField.forcedWinner,false);
  assert.equal(frame.interpretationField.candidates[0].verified,false);
});

test('divergent plausible interpretations remain an open fork instead of an invented common goal', () => {
  const graph=compileSignals([{id:'fork',text:'integrate',interpretations:[
    {meaning:'merge app code',effect:'merge repository'},
    {meaning:'connect account',effect:'connect external account'}
  ]}]);
  const signal=graph.nodes.find(node=>node.type==='signal');
  const objective=graph.nodes.find(node=>node.type==='objective');
  assert.equal(signal.semanticFrame.interpretationField.state,'OPEN_INTERPRETATION_FORK');
  assert.equal(signal.semanticFrame.interpretationField.sharedEffect,null);
  assert.equal(objective.attractorContract.interpretationField.state,'OPEN_INTERPRETATION_FORK');
});

test('no candidates never fabricates a hidden intention', () => {
  const field=frameSignal({text:'strange metaphor'}).interpretationField;
  assert.equal(field.state,'NO_EXPLICIT_CANDIDATES');
  assert.equal(field.sharedEffect,null);
  assert.deepEqual(field.candidates,[]);
});


test('shared invariant changes actual runtime objective, not only prompt language',()=>{
  const input={id:'effect',text:'Интегрируй mondayiD',interpretations:[
    {meaning:'carry state',effect:'continue the existing MondayID'},
    {meaning:'connect organs',effect:'continue the existing MondayID'}
  ]};
  const graph=compileSignals([input]);
  const objective=graph.nodes.find(x=>x.type==='objective');
  assert.equal(objective.effect,'continue the existing MondayID');
  assert.equal(objective.attractorContract.desiredEffect,'continue the existing MondayID');
  assert.equal(objective.semanticFrame.raw,input.text);
});

test('explicit human effect outranks candidates, and divergent candidates do not choose',()=>{
  const interpretations=[
    {meaning:'A',effect:'connect API'},
    {meaning:'B',effect:'connect API'}
  ];
  const explicit=compileSignals([{text:'connect',effect:'audit only',interpretations}]);
  assert.equal(explicit.nodes.find(x=>x.type==='objective').effect,'audit only');
  const fork=compileSignals([{text:'do work',interpretations:[
    {meaning:'A',effect:'merge'},
    {meaning:'B',effect:'deploy'}
  ]}]);
  assert.equal(fork.nodes.find(x=>x.type==='objective').effect,'do work');
});
