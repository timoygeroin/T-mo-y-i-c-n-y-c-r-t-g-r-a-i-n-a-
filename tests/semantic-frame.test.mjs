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
