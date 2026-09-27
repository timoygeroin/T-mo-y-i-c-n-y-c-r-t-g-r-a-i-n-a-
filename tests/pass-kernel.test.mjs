import test from 'node:test';
import assert from 'node:assert/strict';
import { organismGeometry } from '../src/organism-cell.mjs';
import {
  bindNamedOrgans,
  mondayHostRuntime,
  mondayHumanos,
  runInterference,
  skillCreator
} from '../src/pass-kernel.mjs';

test('interference finishes one hundred cells by one hundred passes without a winner', () => {
  const out = runInterference();
  assert.equal(out.ok, true);
  assert.equal(out.proof.ok, true);
  assert.equal(out.cells, 100);
  assert.equal(out.passes, 100);
  assert.equal(out.versions, 10000);
  assert.equal(out.distinctIdeas, 100);
  assert.equal(out.winner, null);
  assert.equal(out.notStored, 'cross-product');
  assert.equal(out.cores.length, 3);
  assert.deepEqual(out.common.geometry, organismGeometry);
  assert.equal(out.witness.checked, true);
  assert.equal(out.witness.n, 17 * 19);
  assert.deepEqual(out.witness.factors, [17, 19]);

  for (const history of out.histories) {
    assert.equal(history.length, 100);
    assert.equal(new Set(history).size, 100);
  }
  assert.equal(out.histories[0][0], 'seed:0');
  assert.equal(out.histories[0][1], 'seed:99');
  assert.equal(out.histories[1][1], 'seed:98');
  assert.equal(out.histories[99][1], 'seed:0');
});

test('a name without proof is not an organ', async () => {
  const refused = await skillCreator({ name: 'skill-creator', proof: { ok: false }, provenance: { source: 'name' } });
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'UNPROVEN_ORGAN');
});

test('humanos keeps metaphor as metaphor and does not schedule the human', () => {
  const surface = mondayHumanos({
    text: 'остров у Магнолии',
    epistemicStance: 'metaphor'
  });
  assert.equal(surface.ok, true);
  assert.equal(surface.schedulesHuman, false);
  assert.equal(surface.stanceUpgraded, false);
  assert.equal(surface.frame.epistemicStance, 'metaphor');
  assert.equal(surface.parallelInterpretations, true);
  assert.equal(surface.reductionNotForced, true);
});

test('host runtime binds the three named organs and does not claim production', async () => {
  const runtime = mondayHostRuntime();
  assert.equal(runtime.productionClaim, false);
  assert.equal(runtime.kernel, 'mondayid-generation-5');
  const bound = await bindNamedOrgans(runtime);
  assert.equal(bound.ok, true);
  assert.equal(bound.winner, null);
  assert.deepEqual(bound.organs.map(organ => organ.name), [
    'skill-creator',
    'monday-humanos',
    'mondayid-host-runtime'
  ]);
  assert.equal(bound.organs.every(organ => organ.state === 'REUSED'), true);
  assert.equal(bound.organs.every(organ => organ.identity === 'organ-not-mondayid'), true);
});
