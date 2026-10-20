import { createHash } from 'node:crypto';
import { TrustedWorldlineReceptor } from './trusted-worldline-receptor.mjs';
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
    defaultModel:env.MONDAYID_OPENAI_MODEL || 'gpt-6.1-sol',
    reasoningMode:env.MONDAYID_REASONING_MODE || 'standard',
    reasoningContext:'all_turns',
    store:false,
    maxOutputTokens,
    criticOutputTokens:Math.min(256,maxOutputTokens),
    maxInputChars
  });

  const modelReceptor = createModelReceptor({
    provider:modelProvider,
    model:env.MONDAYID_OPENAI_MODEL || 'gpt-6.1-sol',
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
    obligations:Array.isArray(signal?.obligations) ? structuredClone(signal.obligations) : [],
    invariants:Array.isArray(signal?.invariants) ? signal.invariants : [],
    rejectedSubstitutions:Array.isArray(signal?.rejectedSubstitutions) ? signal.rejectedSubstitutions : [],
    failureGenes:Array.isArray(signal?.failureGenes) ? signal.failureGenes : [],
    contrastiveExamples:Array.isArray(signal?.contrastiveExamples) ? signal.contrastiveExamples : [],
    complexity:signal?.complexity || null,
    computeTier:signal?.computeTier || null,
    strictMonday:signal?.strictMonday !== false,
    allowDecisionDelegation:signal?.allowDecisionDelegation === true,
    sceneOpen:signal?.sceneOpen === true,
    scene:signal?.scene || null,
    delegatedChoice:signal?.delegatedChoice === true,
    architectureRequested:signal?.architectureRequested === true,
    domains:['general'],
    source:'human'
  };

  const pass = await runtime.runPass([incoming], {maxCycles:2});
  const surface = renderVerifiedCandidateSurface(pass.final || pass);

  const providerEvidence=surface?.evidence?.provider || {};
  const revision=pass.final?.revision || null;

  // A validated model answer and a local runtime revision are NOT proof of
  // cross-host durability. Only an authenticated external exact readback is.
  let receipt = surface.released === true ? {
    id:surface?.evidence?.actionId || (revision ? `revision:${revision}` : 'mondayid:surface'),
    provider:providerEvidence.model || providerEvidence.provider || 'mondayid',
    revision:revision || 'unknown',
    durable:false,
    persistence:'NOT_VERIFIED',
    verification:null
  } : null;

  if (receipt && env.MONDAYID_WORLDLINE_WRITER_TOKEN) {
    // Persist a privacy-preserving receipt identifier, never raw user text,
    // the model answer, or any provider credential.
    const digest=createHash('sha256').update(JSON.stringify({
      signalId:incoming.id,
      revision:receipt.revision,
      response:String(surface.message || '')
    })).digest('hex').slice(0,32);
    const receptor=new TrustedWorldlineReceptor({
      baseUrl:env.MONDAYID_WORLDLINE_URL,
      token:env.MONDAYID_WORLDLINE_WRITER_TOKEN,
      readerToken:env.MONDAYID_WORLDLINE_READ_TOKEN,
      host:'mondayid-chat-host',
      identityFingerprint:'mondayid:rewrite:g5',
      sourceRef:'mondayid-chat-host:response-receipt',
      fetchImpl
    });
    const write=await receptor.execute({
      objectiveId:`chat-response:${digest}`,
      sourceSignal:`chat-response:${digest}`,
      domain:'continuity',
      effect:'persist bounded response receipt (content excluded)'
    });
    const proof=write.ok ? await receptor.verify(write) : null;
    receipt={
      ...receipt,
      durable:proof?.ok === true,
      persistence:proof?.ok === true ? 'EXTERNAL_EXACT_READBACK' : 'UNVERIFIED',
      verification:proof?.ok === true ? {
        mode:proof.mode,
        evidenceRef:proof.eventId,
        writerKeyId:proof.writerKeyId
      } : null,
      persistenceFailure:proof?.ok === true ? null : (
        write.ok ? (proof?.code || 'EXACT_READBACK_FAILED') : (write.code || 'WRITE_FAILED')
      )
    };
  }

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
    receipt,
    status:surface.released ? 200 : 503
  };
}
