import { evaluateCandidateOutput } from './attractor-field.mjs';

const effortForTier = Object.freeze({
  LOW:'low',
  MEDIUM:'medium',
  HIGH:'high',
  MAX:'max'
});

const textOf = value => String(value?.text ?? value?.output ?? value?.message ?? '');

function lineageBlock(lineage = null) {
  const alleles = lineage?.move?.alleles?.length
    ? lineage.move.alleles
    : lineage?.genome?.active_alleles || [];
  if (!alleles.length) return '';
  return [
    'ROLE-LOCKED LINEAGE ALLELES',
    ...alleles.map(allele => `[${allele.role}:${allele.locus}] <= ${allele.ancestor}\n${allele.value}`)
  ].join('\n\n');
}

function contrastiveBlock(examples = []) {
  if (!examples.length) return '';
  return examples.map((example, index) => {
    const label = example.label === 'reject' ? 'REJECTED' : 'ACCEPTED';
    return [
      `[${label} EXAMPLE ${index + 1}]`,
      example.input ? `INPUT: ${example.input}` : '',
      example.output ? `OUTPUT: ${example.output}` : '',
      example.reason ? `WHY: ${example.reason}` : ''
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

export function buildSteeringEnvelope(action = {}) {
  const contract = action.inferenceContract;
  if (!contract) throw new Error('MONDAY_INFERENCE_CONTRACT_REQUIRED');

  const sections = [
    'MONDAYID TASK-LOCAL ATTRACTOR CONTRACT',
    `EXACT OBJECT: ${contract.exactObject}`,
    `DESIRED EFFECT: ${contract.desiredEffect}`,
    contract.preserve?.length ? `PRESERVE: ${contract.preserve.join(' | ')}` : '',
    contract.rejectedSubstitutions?.length
      ? `REJECT SUBSTITUTIONS: ${contract.rejectedSubstitutions.join(' | ')}`
      : '',
    contract.knownFailureGenes?.length
      ? `KNOWN FAILURE GENES: ${contract.knownFailureGenes.join(' | ')}`
      : '',
    lineageBlock(contract.lineage),
    'Do not treat a persona label as sufficient. Solve the exact object.',
    'Generate the best route inside these constraints; do not delegate routine route choice back to the human.',
    contrastiveBlock(contract.contrastiveExamples)
  ].filter(Boolean);

  return Object.freeze({
    schema:'mondayid.model-steering-envelope.v1',
    instruction:sections.join('\n\n'),
    input:String(action.effect || contract.desiredEffect || ''),
    exactObject:contract.exactObject,
    desiredEffect:contract.desiredEffect,
    compute:contract.compute,
    releaseVetoes:contract.genericVetoes || []
  });
}

function normalizeCritique(value = {}) {
  return {
    ok:value.ok !== false,
    score:Number.isFinite(Number(value.score)) ? Number(value.score) : 0,
    reasons:Array.isArray(value.reasons) ? value.reasons.map(String) : []
  };
}

export function createModelReceptor({
  provider,
  model = 'host-selected',
  name = 'monday-attractor-model',
  maxParallelPaths = 6
} = {}) {
  if (!provider || typeof provider.generate !== 'function') {
    throw new Error('MODEL_PROVIDER_GENERATE_REQUIRED');
  }

  return Object.freeze({
    name,
    cost:provider.cost ?? 0,

    supports(action) {
      return Boolean(action?.inferenceContract && action?.effect);
    },

    async execute(action) {
      const contract = action.inferenceContract;
      const envelope = buildSteeringEnvelope(action);
      const requestedPaths = contract?.compute?.topology?.paths || 1;
      const pathCount = Math.max(1, Math.min(maxParallelPaths, requestedPaths));
      const reasoningEffort = effortForTier[contract?.compute?.tier] || 'medium';

      const attempts = await Promise.all(
        Array.from({length:pathCount}, async (_, index) => {
          try {
            const candidate = await provider.generate({
              model,
              input:envelope.input,
              instructions:envelope.instruction,
              reasoningEffort,
              pathIndex:index,
              pathCount,
              contract
            });
            const release = evaluateCandidateOutput(candidate, contract);
            return {
              index,
              ok:release.ok,
              candidate,
              release,
              critique:null
            };
          } catch (error) {
            return {
              index,
              ok:false,
              candidate:null,
              release:{ok:false,code:'MODEL_PROVIDER_ERROR',hits:[]},
              critique:null,
              error:String(error)
            };
          }
        })
      );

      const survivors = attempts.filter(attempt => attempt.ok);
      if (!survivors.length) {
        return {
          ok:false,
          code:'NO_MONDAY_CANDIDATE_SURVIVED',
          attempts,
          evidence:{
            model,
            computeTier:contract?.compute?.tier || null,
            pathCount,
            reasoningEffort
          }
        };
      }

      const criticCount = contract?.compute?.topology?.critics || 0;
      if (criticCount > 0 && typeof provider.critique === 'function') {
        await Promise.all(survivors.map(async attempt => {
          const verdicts = [];
          for (let criticIndex = 0; criticIndex < criticCount; criticIndex += 1) {
            try {
              const verdict = await provider.critique({
                model,
                candidate:attempt.candidate,
                contract,
                envelope,
                criticIndex,
                criticCount
              });
              verdicts.push(normalizeCritique(verdict));
            } catch (error) {
              verdicts.push({ok:false,score:-1,reasons:[String(error)]});
            }
          }
          const accepted = verdicts.filter(v => v.ok);
          attempt.critique = {
            verdicts,
            ok:accepted.length === verdicts.length,
            score:accepted.length
              ? accepted.reduce((sum, v) => sum + v.score, 0) / accepted.length
              : -1
          };
          attempt.ok = attempt.ok && attempt.critique.ok;
        }));
      }

      const finalPool = survivors.filter(attempt => attempt.ok);
      if (!finalPool.length) {
        return {
          ok:false,
          code:'MONDAY_CRITIC_REJECTED_ALL_CANDIDATES',
          attempts,
          evidence:{
            model,
            computeTier:contract?.compute?.tier || null,
            pathCount,
            reasoningEffort,
            criticCount
          }
        };
      }

      finalPool.sort((a,b) => (b.critique?.score ?? 0) - (a.critique?.score ?? 0));
      const selected = finalPool[0];
      const selectedText = textOf(selected.candidate);

      return {
        ok:true,
        text:selectedText,
        candidate:selected.candidate,
        evidence:{
          model,
          contractSchema:contract.schema,
          steeringEnvelope:envelope.schema,
          computeTier:contract?.compute?.tier || null,
          computeScore:contract?.compute?.score ?? null,
          topology:contract?.compute?.topology || null,
          pathCount,
          reasoningEffort,
          criticCount,
          selectedPath:selected.index,
          releaseVerdict:selected.release,
          critique:selected.critique
        },
        attempts
      };
    },

    async verify(result, action) {
      if (result?.ok !== true) {
        return {ok:false,code:result?.code || 'MODEL_EXECUTION_FAILED'};
      }
      if (!result?.evidence?.contractSchema || result.evidence.contractSchema !== action?.inferenceContract?.schema) {
        return {ok:false,code:'MODEL_CONTRACT_READBACK_MISSING'};
      }
      const release = evaluateCandidateOutput(result, action.inferenceContract);
      if (!release.ok) {
        return {ok:false,code:'MONDAY_ATTRACTOR_RELEASE_VETO',hits:[...release.hits]};
      }
      return {
        ok:true,
        mode:'attractor-contract-readback',
        evidence:{
          model:result.evidence.model,
          selectedPath:result.evidence.selectedPath,
          computeTier:result.evidence.computeTier,
          reasoningEffort:result.evidence.reasoningEffort
        }
      };
    }
  });
}
