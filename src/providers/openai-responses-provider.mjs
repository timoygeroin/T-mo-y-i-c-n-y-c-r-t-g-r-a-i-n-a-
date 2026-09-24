const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

function extractOutputText(payload = {}) {
  if (typeof payload.output_text === 'string' && payload.output_text) return payload.output_text;
  const parts = [];
  for (const item of payload.output || []) {
    if (item?.type !== 'message' && !Array.isArray(item?.content)) continue;
    for (const content of item.content || []) {
      if (typeof content?.text === 'string') parts.push(content.text);
      else if (typeof content?.text?.value === 'string') parts.push(content.text.value);
    }
  }
  return parts.join('\n').trim();
}

function safeJson(text) {
  try { return JSON.parse(text); }
  catch { return null; }
}

export class OpenAIResponsesProvider {
  constructor({
    apiKey = process.env.OPENAI_API_KEY,
    baseUrl = DEFAULT_BASE_URL,
    fetchImpl = globalThis.fetch,
    defaultModel = 'gpt-5.6-sol',
    reasoningMode = 'standard',
    reasoningContext = 'all_turns',
    store = false,
    maxOutputTokens = 512,
    criticOutputTokens = 256,
    maxInputChars = 12000
  } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/,'');
    this.fetchImpl = fetchImpl;
    this.defaultModel = defaultModel;
    this.reasoningMode = reasoningMode;
    this.reasoningContext = reasoningContext;
    this.store = store;
    this.maxOutputTokens = Number(maxOutputTokens);
    this.criticOutputTokens = Number(criticOutputTokens);
    this.maxInputChars = Number(maxInputChars);
    if (!Number.isInteger(this.maxOutputTokens) || this.maxOutputTokens < 1) throw new Error('OPENAI_MAX_OUTPUT_TOKENS_REQUIRED');
    if (!Number.isInteger(this.criticOutputTokens) || this.criticOutputTokens < 1) throw new Error('OPENAI_CRITIC_OUTPUT_TOKENS_REQUIRED');
    if (!Number.isInteger(this.maxInputChars) || this.maxInputChars < 1) throw new Error('OPENAI_MAX_INPUT_CHARS_REQUIRED');
  }

  #assertInputBudget(instructions, input) {
    const chars = String(instructions || '').length + String(input || '').length;
    if (chars > this.maxInputChars) throw new Error(`OPENAI_INPUT_BUDGET_EXCEEDED:${chars}>${this.maxInputChars}`);
    return chars;
  }

  async #request(body) {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY_MISSING');
    if (typeof this.fetchImpl !== 'function') throw new Error('OPENAI_FETCH_MISSING');

    const response = await this.fetchImpl(`${this.baseUrl}/responses`, {
      method:'POST',
      headers:{
        authorization:`Bearer ${this.apiKey}`,
        'content-type':'application/json'
      },
      body:JSON.stringify(body)
    });

    const text = await response.text();
    const payload = safeJson(text) || { raw:text };
    if (!response.ok) {
      const detail = payload?.error?.message || payload?.raw || response.statusText || 'unknown';
      throw new Error(`OPENAI_RESPONSES_HTTP_${response.status}:${detail}`);
    }
    return payload;
  }

  async generate({
    model = this.defaultModel,
    input,
    instructions,
    reasoningEffort = 'medium',
    pathIndex = 0,
    pathCount = 1,
    contract = null
  } = {}) {
    const reasoning = {
      effort:reasoningEffort,
      context:this.reasoningContext
    };
    if (this.reasoningMode) reasoning.mode = this.reasoningMode;

    const inputChars = this.#assertInputBudget(instructions, input);
    const payload = await this.#request({
      model,
      instructions,
      input,
      reasoning,
      max_output_tokens:this.maxOutputTokens,
      store:this.store,
      metadata:{
        monday_contract:String(contract?.schema || 'none'),
        monday_compute_tier:String(contract?.compute?.tier || 'unknown'),
        monday_path:`${pathIndex + 1}/${pathCount}`
      }
    });

    return {
      ok:true,
      text:extractOutputText(payload),
      evidence:{
        provider:'openai-responses',
        responseId:payload.id || null,
        model:payload.model || model,
        reasoning:payload.reasoning || reasoning,
        usage:payload.usage || null,
        pathIndex,
        pathCount,
        budget:{maxOutputTokens:this.maxOutputTokens,maxInputChars:this.maxInputChars,inputChars}
      },
      raw:payload
    };
  }

  async critique({
    model = this.defaultModel,
    candidate,
    contract,
    criticIndex = 0,
    criticCount = 1
  } = {}) {
    const candidateText = String(candidate?.text ?? candidate?.output ?? candidate?.message ?? '');
    const rubric = {
      exactObject:contract?.exactObject || '',
      desiredEffect:contract?.desiredEffect || '',
      preserve:contract?.preserve || [],
      rejectedSubstitutions:contract?.rejectedSubstitutions || [],
      knownFailureGenes:contract?.knownFailureGenes || []
    };

    const criticInstructions=[
        'You are an adversarial verifier inside MondayID.',
        'Evaluate the candidate against the exact object and desired effect.',
        'Reject convenient substitutions, known failure genes, unsupported completion, and user-retraining leakage.',
        'Return ONLY compact JSON: {"ok":boolean,"score":number 0..1,"reasons":[string]}.'
      ].join('\n');
    const criticInput=JSON.stringify({
        rubric,
        candidate:candidateText,
        critic:`${criticIndex + 1}/${criticCount}`
      });
    this.#assertInputBudget(criticInstructions, criticInput);

    const payload = await this.#request({
      model,
      instructions:criticInstructions,
        'You are an adversarial verifier inside MondayID.',
        'Evaluate the candidate against the exact object and desired effect.',
        'Reject convenient substitutions, known failure genes, unsupported completion, and user-retraining leakage.',
        'Return ONLY compact JSON: {"ok":boolean,"score":number 0..1,"reasons":[string]}.'
      ].join('\n'),
      input:JSON.stringify({
        rubric,
        candidate:candidateText,
        critic:`${criticIndex + 1}/${criticCount}`
      }),
      reasoning:{
        effort:contract?.compute?.tier === 'MAX' ? 'max' : 'high',
        context:'current_turn',
        mode:this.reasoningMode || 'standard'
      },
      max_output_tokens:this.criticOutputTokens,
      store:this.store,
      metadata:{
        monday_contract:String(contract?.schema || 'none'),
        monday_role:'critic',
        monday_critic:`${criticIndex + 1}/${criticCount}`
      }
    });

    const parsed = safeJson(extractOutputText(payload));
    if (!parsed || typeof parsed.ok !== 'boolean') {
      return {ok:false,score:-1,reasons:['CRITIC_OUTPUT_UNPARSEABLE']};
    }
    return {
      ok:parsed.ok,
      score:Number.isFinite(Number(parsed.score)) ? Math.max(0,Math.min(1,Number(parsed.score))) : 0,
      reasons:Array.isArray(parsed.reasons) ? parsed.reasons.map(String) : []
    };
  }
}

export function createOpenAIResponsesProvider(options = {}) {
  return new OpenAIResponsesProvider(options);
}
