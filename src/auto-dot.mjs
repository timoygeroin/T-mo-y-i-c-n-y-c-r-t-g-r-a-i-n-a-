/**
 * AutoDot: event-driven, bounded continuation for a MondayID-owned host.
 * The host MUST emit a turn completion event and supply a real action executor.
 * This module does not intercept native ChatGPT messages and does not invent an executor.
 */
export class AutoDotRelay {
  #execute;
  #record;
  #claim;
  #active = new Set();
  #seen = new Set();
  #maxHops;

  constructor({ execute, record = async () => {}, claim = null, maxHops = 8 } = {}) {
    if (typeof execute !== 'function') throw new TypeError('execute is required');
    if (typeof record !== 'function') throw new TypeError('record must be a function');
    if (claim !== null && typeof claim !== 'function') throw new TypeError('claim must be a function');
    if (!Number.isSafeInteger(maxHops) || maxHops < 1 || maxHops > 64) {
      throw new RangeError('maxHops must be an integer from 1 to 64');
    }
    this.#execute = execute;
    this.#record = record;
    this.#claim = claim;
    this.#maxHops = maxHops;
  }

  async onTurnComplete({ eventId, taskId, openWork = false, ownerApprovalRequired = false, cursor = null } = {}) {
    if (!eventId || !taskId) return { ok:false, state:'REJECTED', reason:'EVENT_AND_TASK_REQUIRED' };
    if (!openWork) return { ok:true, state:'IDLE', hops:0 };
    if (ownerApprovalRequired) return { ok:true, state:'OWNER_APPROVAL_REQUIRED', hops:0 };
    if (this.#active.has(taskId)) return { ok:true, state:'ALREADY_RUNNING', hops:0 };
    if (this.#seen.has(eventId)) return { ok:true, state:'DUPLICATE', hops:0 };

    // Production hosts must supply a durable, atomic claim keyed by eventId.
    // Without it, deduplication applies only to this process lifetime.
    if (this.#claim) {
      const claimed = await this.#claim(eventId, taskId);
      if (claimed !== true) return { ok:true, state:'DUPLICATE', hops:0 };
    }
    this.#seen.add(eventId);
    this.#active.add(taskId);

    let nextCursor = cursor;
    try {
      for (let hop = 1; hop <= this.#maxHops; hop += 1) {
        let result;
        try {
          result = await this.#execute({ eventId, taskId, cursor:nextCursor, hop });
        } catch (error) {
          const receipt = {eventId, taskId, hop, state:'BLOCKED', reason:'EXECUTOR_ERROR', error:String(error)};
          await this.#record(receipt);
          return {ok:false, state:'BLOCKED', reason:'EXECUTOR_ERROR', hops:hop};
        }

        const status = result?.state;
        if (result?.ok !== true || !['PROGRESSED','FULFILLED'].includes(status)) {
          await this.#record({eventId,taskId,hop,state:'BLOCKED',reason:result?.reason || 'UNVERIFIED_OR_BLOCKED'});
          return {ok:false, state:'BLOCKED', reason:result?.reason || 'UNVERIFIED_OR_BLOCKED', hops:hop};
        }

        if (status === 'FULFILLED') {
          await this.#record({eventId,taskId,hop,state:'FULFILLED',evidence:result.evidence ?? null});
          return {ok:true,state:'FULFILLED',hops:hop};
        }
        if (result.nextCursor == null || result.nextCursor === nextCursor || !result.evidence) {
          await this.#record({eventId,taskId,hop,state:'BLOCKED',reason:'NO_VERIFIED_FORWARD_PROGRESS'});
          return {ok:false,state:'BLOCKED',reason:'NO_VERIFIED_FORWARD_PROGRESS',hops:hop};
        }

        // The next action is never attempted before the previous result is recorded.
        await this.#record({eventId,taskId,hop,state:'PROGRESSED',nextCursor:result.nextCursor,evidence:result.evidence});
        nextCursor = result.nextCursor;
      }
      return {ok:true,state:'YIELDED',reason:'HOP_BUDGET',hops:this.#maxHops,nextCursor};
    } finally {
      this.#active.delete(taskId);
    }
  }
}

/** Connect a host's finish callback to the relay. This is the real trigger. */
export function autoDotOnFinish(turnHandler, relay, deriveCompletion) {
  if (typeof turnHandler !== 'function' || typeof deriveCompletion !== 'function') {
    throw new TypeError('turnHandler and deriveCompletion must be functions');
  }
  if (!relay || typeof relay.onTurnComplete !== 'function') throw new TypeError('relay is required');
  return async (...args) => {
    const turn = await turnHandler(...args);
    const completion = await deriveCompletion(turn, ...args);
    const continuation = await relay.onTurnComplete(completion);
    return {turn, continuation};
  };
}
