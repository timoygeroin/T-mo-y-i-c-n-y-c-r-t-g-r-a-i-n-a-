import crypto from 'node:crypto';

const stable = value => Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value);

const digest = value => crypto.createHash('sha256').update(stable(value)).digest('hex').slice(0, 24);

const parseJson = async response => {
  try { return await response.json(); }
  catch { return null; }
};

export class TrustedWorldlineReceptor {
  constructor({
    baseUrl,
    token,
    host = 'mondayid-rewrite',
    identityFingerprint = 'mondayid:rewrite:g5',
    sourceRef = 'mondayid-rewrite-runtime',
    fetchImpl = globalThis.fetch
  } = {}) {
    this.name = 'trusted-worldline-v4';
    this.baseUrl = baseUrl;
    this.token = token;
    this.host = host;
    this.identityFingerprint = identityFingerprint;
    this.sourceRef = sourceRef;
    this.fetchImpl = fetchImpl;
    this.exposes = ['external-effect','shared-worldline-write','exact-readback','conflict-preservation'];
    this.cost = 0;
  }

  eventFor(action = {}) {
    const core = {
      objectiveId: action.objectiveId ?? null,
      sourceSignal: action.sourceSignal ?? null,
      domain: action.domain ?? null,
      effect: action.effect ?? null
    };
    const eventId = `E-RW4-${digest({ host:this.host, identity:this.identityFingerprint, core })}`;
    return {
      eventId,
      timestampIso: new Date().toISOString(),
      subject: action.sourceSignal || action.objectiveId || 'mondayid-runtime',
      predicate: 'verified_external_effect',
      valueJson: JSON.stringify(core),
      epistemicStatus: 'VERIFIED',
      sourceRef: this.sourceRef,
      host: this.host,
      identityFingerprint: this.identityFingerprint
    };
  }

  async execute(action) {
    if (!this.baseUrl) return { ok:false, code:'NO_WORLDLINE_URL' };
    if (!this.token) return { ok:false, code:'NO_WORLDLINE_WRITER_TOKEN' };
    if (typeof this.fetchImpl !== 'function') return { ok:false, code:'NO_FETCH' };

    const event = this.eventFor(action);
    const url = new URL('/worldline/v4/append', this.baseUrl);
    let response;
    try {
      response = await this.fetchImpl(url, {
        method:'POST',
        headers:{
          authorization:`Bearer ${this.token}`,
          'content-type':'application/json'
        },
        body:JSON.stringify(event)
      });
    } catch (error) {
      return { ok:false, code:'WORLDLINE_WRITE_FAILED', event, error:String(error) };
    }

    const receipt = await parseJson(response);
    if (!response?.ok || receipt?.ok !== true) {
      return {
        ok:false,
        code:receipt?.status === 'CONFLICT_UNRESOLVED' ? 'WORLDLINE_CONFLICT' : 'WORLDLINE_WRITE_REJECTED',
        status:response?.status ?? null,
        event,
        receipt
      };
    }

    return {
      ok:true,
      status:receipt.status,
      event,
      receipt
    };
  }

  async verify(result) {
    if (!result?.ok || !result?.event?.eventId) {
      return { ok:false, code:'NO_SUCCESSFUL_WRITE_RESULT' };
    }

    const url = new URL('/worldline/v4/event', this.baseUrl);
    url.searchParams.set('eventId', result.event.eventId);

    let response;
    try {
      response = await this.fetchImpl(url);
    } catch (error) {
      return { ok:false, code:'WORLDLINE_READBACK_FAILED', error:String(error) };
    }

    const body = await parseJson(response);
    const event = body?.event;
    const conflicts = Array.isArray(body?.conflicts) ? body.conflicts : [];
    const same =
      response?.ok &&
      body?.schema === 'mondayid.worldline.event.v0.4.0' &&
      event?.eventId === result.event.eventId &&
      event?.valueJson === result.event.valueJson &&
      event?.identityFingerprint === this.identityFingerprint &&
      conflicts.length === 0;

    return {
      ok:Boolean(same),
      mode:'external-exact-readback',
      eventId:result.event.eventId,
      conflictCount:conflicts.length,
      writerKeyId:event?.writerKeyId ?? null
    };
  }
}
