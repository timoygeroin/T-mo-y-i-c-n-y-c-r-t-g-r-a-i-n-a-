import { MondayRuntime } from './runtime.mjs';
import { recoverWorldline } from './remote-worldline.mjs';
import { renderVerifiedCandidateSurface } from './interface.mjs';
import { createModelReceptor } from './model-receptor.mjs';
import { createOpenAIResponsesProvider } from './providers/openai-responses-provider.mjs';

export async function runChatHost({
  signal,
  env = process.env,
  fetchImpl = globalThis.fetch,
  provider = null
} = {}) {
  if (env.MONDAYID_MODEL_EXECUTION_ENABLED !== 'true') {
    return {
      ok:false,
      state:'BLOCKED',
      code:'MODEL_EXECUTION_DISABLED',
      status:503
    };
  }

  if (!env.MONDAYID_WORLDLINE_URL) {
    return {
      ok:false,
      state:'UNRESOLVED',
      code:'WORLDLINE_URL_MISSING',
      status:503
    };
  }

  if (!provider && !env.OPENAI_API_KEY) {
    return {
      ok:false,
      state:'BLOCKED',
      code:'OPENAI_API_KEY_MISSING',
      status:503
    };
  }

  const recovered = await recoverWorldline({
    baseUrl:env.MONDAYID_WORLDLINE_URL,
    limit:10,
    trust:'trusted',
    fetchImpl
  });

  if (!recovered.ok) {
    return {
      ok:false,
      state:'UNRESOLVED',
      code:recovered.code || 'WORLDLINE_RECOVERY_FAILED',
      status:recovered.status || 503
    };
  }

  const modelProvider = provider || createOpenAIResponsesProvider({
    apiKey:env.OPENAI_API_KEY,
    fetchImpl,
    defaultModel:env.MONDAYID_OPENAI_MODEL || 'gpt-5.6-sol',
    reasoningMode:env.MONDAYID_REASONING_MODE || 'standard',
    reasoningContext:'all_turns',
    store:false
  });

  const modelReceptor = createModelReceptor({
    provider:modelProvider,
    model:env.MONDAYID_OPENAI_MODEL || 'gpt-5.6-sol',
    name:'monday-openai-attractor-receptor'
  });

  const runtime = new MondayRuntime({
    worldline:recovered.worldline,
    capabilities:{general:modelReceptor}
  });

  const incoming = {
    id:signal?.id || `chat:${Date.now()}`,
    text:String(signal?.text || ''),
    effect:signal?.desiredEffect || signal?.effect || String(signal?.text || ''),
    exactObject:signal?.exactObject || null,
    desiredEffect:signal?.desiredEffect || null,
    invariants:Array.isArray(signal?.invariants) ? signal.invariants : [],
    rejectedSubstitutions:Array.isArray(signal?.rejectedSubstitutions) ? signal.rejectedSubstitutions : [],
    failureGenes:Array.isArray(signal?.failureGenes) ? signal.failureGenes : [],
    contrastiveExamples:Array.isArray(signal?.contrastiveExamples) ? signal.contrastiveExamples : [],
    complexity:signal?.complexity || null,
    computeTier:signal?.computeTier || null,
    strictMonday:signal?.strictMonday !== false,
    allowDecisionDelegation:signal?.allowDecisionDelegation === true,
    domains:['general'],
    source:'human'
  };

  const pass = await runtime.runPass([incoming], {maxCycles:2});
  const surface = renderVerifiedCandidateSurface(pass.final || pass);

  return {
    ok:pass.ok === true && pass.state === 'FULFILLED' && surface.released === true,
    state:pass.state,
    reason:pass.reason,
    worldline:{
      trust:recovered.trust,
      schema:recovered.snapshot?.schema || null,
      imported:recovered.imported ?? null
    },
    compute:pass.final?.graph?.nodes?.find(node => node.type === 'signal')?.attractorContract?.compute || null,
    surface,
    status:surface.released ? 200 : 503
  };
}
