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

  if (env.MONDAYID_API_SPEND_ENABLED !== 'true') {
    return {
      ok:false,
      state:'BLOCKED',
      code:'API_SPEND_NOT_AUTHORIZED',
      status:503
    };
  }

  const maxOutputTokens=Number(env.MONDAYID_MAX_OUTPUT_TOKENS);
  const maxInputChars=Number(env.MONDAYID_MAX_INPUT_CHARS);
  const maxParallelPaths=Number(env.MONDAYID_MAX_PARALLEL_PATHS);
  const maxCritics=Number(env.MONDAYID_MAX_CRITICS);
  const budgetValid =
    Number.isInteger(maxOutputTokens) && maxOutputTokens > 0 &&
    Number.isInteger(maxInputChars) && maxInputChars > 0 &&
    Number.isInteger(maxParallelPaths) && maxParallelPaths >= 1 && maxParallelPaths <= 6 &&
    Number.isInteger(maxCritics) && maxCritics >= 0 && maxCritics <= 2;
  if (!budgetValid) {
    return {
      ok:false,
      state:'BLOCKED',
      code:'MODEL_BUDGET_CONFIG_REQUIRED',
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
    store:false,
    maxOutputTokens,
    criticOutputTokens:Math.min(256,maxOutputTokens),
    maxInputChars
  });

  const modelReceptor = createModelReceptor({
    provider:modelProvider,
    model:env.MONDAYID_OPENAI_MODEL || 'gpt-5.6-sol',
    name:'monday-openai-attractor-receptor',
    maxParallelPaths,
    maxCritics
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
    budget:{maxOutputTokens,maxInputChars,maxParallelPaths,maxCritics},
    surface,
    status:surface.released ? 200 : 503
  };
}
