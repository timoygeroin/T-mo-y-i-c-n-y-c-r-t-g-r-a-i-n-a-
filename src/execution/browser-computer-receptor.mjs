function matchesObservation(observation, acceptance = {}) {
  const value = observation?.value ?? observation?.text ?? observation?.url ?? null;
  if (Object.hasOwn(acceptance,'equals') && value !== acceptance.equals) return false;
  if (acceptance.includes && !String(value ?? '').includes(String(acceptance.includes))) return false;
  if (acceptance.ok === true && observation?.ok !== true) return false;
  return true;
}

export function createBrowserComputerReceptor({ driver, name = 'mondayid-browser-computer' } = {}) {
  if (!driver || typeof driver.perform !== 'function' || typeof driver.observe !== 'function') {
    throw new TypeError('browser computer receptor requires driver.perform() and driver.observe()');
  }

  return Object.freeze({
    name,
    exposes:['browser.navigate','browser.interact','browser.observe','independent.readback'],
    cost:2,

    supports(action) {
      const route=action?.routeCandidate;
      return Boolean(
        ['host','general'].includes(action?.domain) &&
        route?.kind === 'browser' &&
        Array.isArray(route.steps) &&
        route.steps.length > 0 &&
        route.verification?.probe &&
        route.verification?.acceptance
      );
    },

    async execute(action) {
      const route=action?.routeCandidate;
      if (!route || route.kind !== 'browser') return {ok:false,code:'BROWSER_CONTRACT_MISSING'};
      const receipts=[];
      for (const step of route.steps || []) {
        const receipt=await driver.perform(step);
        receipts.push(receipt);
        if (receipt?.ok === false) {
          return {ok:false,code:'BROWSER_STEP_FAILED',effect:action.effect,receipts,failedStep:step};
        }
      }
      return {
        ok:true,
        effect:action.effect,
        receipts,
        verification:route.verification
      };
    },

    async verify(result) {
      if (result?.ok !== true) return {ok:false,code:'BROWSER_EXECUTION_FAILED'};
      const probe=result?.verification?.probe;
      const acceptance=result?.verification?.acceptance;
      if (!probe || !acceptance) return {ok:false,code:'BROWSER_READBACK_CONTRACT_MISSING'};
      const observation=await driver.observe(probe);
      const ok=matchesObservation(observation,acceptance);
      return {
        ok,
        code:ok ? null : 'BROWSER_READBACK_FAILED',
        mode:'independent-browser-readback',
        observation
      };
    }
  });
}
