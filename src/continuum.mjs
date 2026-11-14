// Monday Continuum: deterministic, replayable event-driven task handoff.
// Storage and dispatch are injected; no claim of persistent runtime without adapters.
export class Continuum {
  constructor({ store, executors, verify, maxAttempts = 3 }) {
    if (!store?.append || !store?.events || !executors || !verify) throw new Error('CONTINUUM_ADAPTER_REQUIRED');
    this.store = store;
    this.executors = executors;
    this.verify = verify;
    this.maxAttempts = maxAttempts;
  }
  async state(taskId) {
    const events = await this.store.events(taskId);
    return events.reduce((s, e) => {
      if (e.type === 'TASK_CREATED') return { ...s, status:'PENDING', payload:e.payload, attempts:0 };
      if (e.type === 'TASK_CLAIMED') return { ...s, status:'RUNNING', attempts:s.attempts+1, executor:e.executor };
      if (e.type === 'TASK_VERIFIED') return { ...s, status:'DONE', result:e.result };
      if (e.type === 'TASK_REJECTED') return { ...s, status:'PENDING', error:e.reason };
      if (e.type === 'TASK_BLOCKED') return { ...s, status:'BLOCKED', error:e.reason };
      return s;
    }, { status:'MISSING', attempts:0 });
  }
  async submit(taskId, payload) {
    if ((await this.state(taskId)).status !== 'MISSING') return this.state(taskId);
    await this.store.append(taskId, { type:'TASK_CREATED', payload });
    return this.state(taskId);
  }
  async step(taskId) {
    const state = await this.state(taskId);
    if (state.status !== 'PENDING') return state;
    if (state.attempts >= this.maxAttempts) {
      await this.store.append(taskId, { type:'TASK_BLOCKED', reason:'ATTEMPT_LIMIT' });
      return this.state(taskId);
    }
    const executor = this.executors.find(e => e.canRun(state.payload, state.attempts));
    if (!executor) {
      await this.store.append(taskId, { type:'TASK_BLOCKED', reason:'NO_EXECUTOR' });
      return this.state(taskId);
    }
    // Production store must atomically claim to prevent concurrent double execution.
    await this.store.append(taskId, { type:'TASK_CLAIMED', executor:executor.name });
    try {
      const result = await executor.run(state.payload, { taskId, attempt:state.attempts+1 });
      if (await this.verify(state.payload, result)) {
        await this.store.append(taskId, { type:'TASK_VERIFIED', result });
      } else {
        await this.store.append(taskId, { type:'TASK_REJECTED', reason:'VERIFICATION_FAILED' });
      }
    } catch (error) {
      await this.store.append(taskId, { type:'TASK_REJECTED', reason:String(error) });
    }
    return this.state(taskId);
  }
}
