import test from 'node:test';
import assert from 'node:assert/strict';
import { runEvolutionBurst } from '../src/evolution-burst.mjs';

test('burst runs multiple generations inside one invocation and keeps only strict improvements', async()=>{
  const result=await runEvolutionBurst({
    initial:{name:'g0',score:1},
    generations:8,
    mutate:async(champion,generation)=>[
      {name:`g${generation}-a`,score:champion.score+1},
      {name:`g${generation}-b`,score:champion.score-3},
      {name:`g${generation}-c`,score:champion.score+0.5}
    ],
    evaluate:async(candidate)=>({ok:true,score:candidate.score})
  });
  assert.equal(result.generationsAttempted,8);
  assert.equal(result.generationsAccepted,8);
  assert.equal(result.champion.score,9);
  assert.equal(result.lineage.length,9);
});

test('regressions die and never become ancestors', async()=>{
  const result=await runEvolutionBurst({
    initial:{name:'root',score:10},
    generations:4,
    mutate:async()=>[{name:'bad',score:2},{name:'worse',score:1}],
    evaluate:async(candidate)=>({ok:true,score:candidate.score})
  });
  assert.equal(result.generationsAccepted,0);
  assert.equal(result.champion.name,'root');
  assert.ok(result.rejections.every(x=>x.reason==='NO_STRICT_IMPROVEMENT'));
});

test('failed verification can never win even with a huge score', async()=>{
  const result=await runEvolutionBurst({
    initial:{name:'root',score:1},
    generations:1,
    mutate:async()=>[{name:'fake',score:999},{name:'real',score:2}],
    evaluate:async(candidate)=>candidate.name==='fake'
      ? {ok:false,score:999}
      : candidate.name==='real'
        ? {ok:true,score:2}
        : {ok:true,score:1}
  });
  assert.equal(result.champion.name,'real');
});

test('burst stops on plateau instead of burning generations ceremonially', async()=>{
  const result=await runEvolutionBurst({
    initial:{name:'root',score:5},
    generations:20,
    plateauLimit:3,
    mutate:async()=>[{name:'same',score:5}],
    evaluate:async(candidate)=>({ok:true,score:candidate.score})
  });
  assert.equal(result.generationsAttempted,3);
  assert.equal(result.stopReason,'EVIDENCE_PLATEAU');
});

test('burst can optimize a vector objective rather than one scalar vanity score', async()=>{
  const result=await runEvolutionBurst({
    initial:{name:'root',metrics:{effect:1,truth:1,corrections:5}},
    generations:2,
    mutate:async(champion,generation)=>generation===1
      ? [
          {name:'verbose',metrics:{effect:2,truth:1,corrections:6}},
          {name:'better',metrics:{effect:2,truth:2,corrections:3}}
        ]
      : [{name:'best',metrics:{effect:3,truth:2,corrections:1}}],
    evaluate:async(candidate)=>({
      ok:true,
      metrics:candidate.metrics,
      score:candidate.metrics.effect*4 + candidate.metrics.truth*4 - candidate.metrics.corrections
    })
  });
  assert.equal(result.champion.name,'best');
});
