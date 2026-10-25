/**
 * DEUS-0: bounded counterfactual organ for the existing MondayID organism.
 * Hypotheses are simulated, never executed. No network, filesystem, model or effectors.
 * Inputs are numeric toy models supplied by an observer, NOT facts about reality.
 */
import { createHash } from 'node:crypto';

const SCHEMA = 'mondayid.deus0.simulation.v1';
const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1_000_000;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const canonical = x => Array.isArray(x) ? \`[\${x.map(canonical).join(',')}]\`
  : x && typeof x === 'object' ? \`{\${Object.keys(x).sort().map(k => \`\${JSON.stringify(k)}:\${canonical(x[k])}\`).join(',')}}\`
  : JSON.stringify(x);
const digest = x => createHash('sha256').update(canonical(x)).digest('hex');
const plain = x => x != null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;

function fail(code) { throw new TypeError(\`DEUS0_\${code}\`); }
function metrics(obj, name, keys = null) {
  if (!plain(obj)) fail(\`\${name}_OBJECT_REQUIRED\`);
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!/^[a-z][a-z\d_]{0,31}$/i.test(k) || (keys && !keys.includes(k)) || !finite(v)) fail(\`\${name}_INVALID_METRIC\`);
    result[k] = v;
  }
  return result;
}
function bounds(obj, name, keys) {
  if (!plain(obj)) fail(\`\${name}_OBJECT_REQUIRED\`);
  const result = {};
  for (const [k, b] of Object.entries(obj)) {
    if (!keys.includes(k) || !plain(b) || !Object.keys(b).length || Object.keys(b).some(x=>!['min','max'].includes(x)) ||
        (own(b,'min') && !finite(b.min)) || (own(b,'max') && !finite(b.max)) ||
        (own(b,'min') && own(b,'max') && b.min > b.max)) fail(\`\${name}_INVALID_BOUND\`);
    result[k] = { ...(own(b,'min') ? {min:b.min} : {}), ...(own(b,'max') ? {max:b.max} : {}) };
  }
  return result;
}
const meets = (state, rules) => Object.entries(rules).every(([key, b]) =>
  (!own(b,'min') || state[key] >= b.min) && (!own(b,'max') || state[key] <= b.max));
const violations = (state, rules) => Object.entries(rules).filter(([key, b]) =>
  (own(b,'min') && state[key] < b.min) || (own(b,'max') && state[key] > b.max)).map(([key])=>key);

function normalize(spec) {
  if (!plain(spec) || typeof spec.id !== 'string' || !/^[a-z\d][a-z\d_.:-]{0,63}$/i.test(spec.id)) fail('INVALID_ID');
  const initial = metrics(spec.initial,'INITIAL');
  const keys = Object.keys(initial).sort();
  if (keys.length < 1 || keys.length > 12) fail('INVALID_DIMENSIONS');
  const goals = bounds(spec.goals, 'GOALS', keys);
  if (!Object.keys(goals).length) fail('GOAL_REQUIRED');
  const constraints = bounds(spec.constraints || {}, 'CONSTRAINTS', keys);
  if (!meets(initial, constraints)) fail('INITIAL_BREAKS_INVARIANTS');
  const horizon = spec.horizon ?? 4;
  const maxNodes = spec.maxNodes ?? 512;
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 8) fail('INVALID_HORIZON');
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 4096) fail('INVALID_NODE_BUDGET');
  if (!Array.isArray(spec.actions) || !spec.actions.length || spec.actions.length > 32) fail('INVALID_ACTIONS');
  const ids = new Set();
  const actions = spec.actions.map(a=>{
    if (!plain(a) || typeof a.id !== 'string' || !/^[a-z\d][a-z\d_.:-]{0,63}$/i.test(a.id) || ids.has(a.id)) fail('INVALID_ACTION_ID');
    ids.add(a.id);
    if (a.externalEffect === true || own(a,'execute') || own(a,'command') || own(a,'url')) fail('EXTERNAL_EXECUTION_FORBIDDEN');
    const delta = metrics(a.delta, 'DELTA', keys);
    if (!Object.keys(delta).length) fail('EMPTY_DELTA');
    const requires = bounds(a.requires || {},'REQUIRES',keys);
    const cost = a.cost ?? 0;
    const risk = a.risk ?? 0;
    if (!finite(cost) || cost < 0 || !finite(risk) || risk < 0 || risk > 1) fail('INVALID_RISK_OR_COST');
    if (a.repeatable != null && typeof a.repeatable !== 'boolean') fail('INVALID_REPEATABLE');
    return {id:a.id,delta,requires,cost,risk,repeatable:a.repeatable === true,source:typeof a.source === 'string' ? a.source.slice(0,160) : 'user-assumption'};
  });
  return {id:spec.id,initial,goals,constraints,actions,horizon,maxNodes};
}
const gap = (s,goal) => Object.entries(goal).reduce((n,[key,b])=> n +
  (own(b,'min') ? Math.max(0,b.min-s[key]) : 0) +
  (own(b,'max') ? Math.max(0,s[key]-b.max) : 0),0);
const rank = (a,b)=> (a.goalGap-b.goalGap) || (a.risk-b.risk) || (a.cost-b.cost) ||
  (a.steps.length-b.steps.length) || a.steps.join('/').localeCompare(b.steps.join('/'));

export function simulateDeus0(input) {
  const model = normalize(input);
  const {id,initial,goals,constraints,actions,horizon,maxNodes} = model;
  const initialNode = {state:{...initial},steps:[],trace:[],cost:0,risk:0,goalGap:gap(initial,goals)};
  const queue = [initialNode];
  const terminal = [];
  const rejected = {precondition:0,invariant:0,nonFinite:0,repeat:0};
  let explored = 0;
  let generated = 0;
  let cutByBudget = false;
  let proofChecks = 0;

  while (queue.length) {
    if (explored >= maxNodes) {cutByBudget=true;break;}
    const node = queue.shift();
    explored++;
    // Every successor was independently validated. Verify the model's own constraints again.
    if (!meets(node.state,constraints)) fail('INTERNAL_INVARIANT_FAILURE');
    proofChecks++;
    if (node.goalGap === 0 || node.steps.length === horizon) {
      terminal.push(node);
      continue;
    }
    for (const action of actions) {
      if (!action.repeatable && node.steps.includes(action.id)) { rejected.repeat++;continue; }
      if (!meets(node.state,action.requires)) { rejected.precondition++;continue; }
      const nextState={...node.state};
      for (const [metric,d] of Object.entries(action.delta)) nextState[metric]+=d;
      if (Object.values(nextState).some(v=>!finite(v))) {rejected.nonFinite++;continue;}
      const rejectedMetrics=violations(nextState,constraints);
      if (rejectedMetrics.length) {rejected.invariant++;continue;}
      generated++;
      queue.push({
        state:nextState,
        steps:[...node.steps,action.id],
        trace:[...node.trace,{action:action.id,before:{...node.state},after:{...nextState},source:action.source}],
        cost:node.cost+action.cost,
        risk:1-(1-node.risk)*(1-action.risk),
        goalGap:gap(nextState,goals)
      });
    }
  }
  // Include eligible, already-generated frontier candidates when search budget ran out.
  const candidates=[...terminal,...queue];
  candidates.sort(rank);
  const best=candidates[0] || initialNode;
  const achieved=best.goalGap===0;
  const body={
    schema:SCHEMA,
    id,
    epistemic:'hypothetical',
    externalActionsExecuted:0,
    inputDigest:digest(model),
    state:achieved ? 'SIMULATED_GOAL_REACHED' : 'NO_GOAL_WITHIN_SEARCH',
    exhaustive:!cutByBudget,
    modelLimits:{horizon,maxNodes,assumptionsNotValidatedInReality:true},
    search:{explored,generated,rejected,proofChecks,pending:queue.length},
    proposal:{steps:[...best.steps],finalState:{...best.state},goalGap:best.goalGap,cost:best.cost,risk:Number(best.risk.toFixed(10)),trace:best.trace},
    independentRealityReadback:false,
    nextGate:'EXTERNAL_OBSERVATION_REQUIRED_FOR_REAL_WORLD_CLAIMS'
  };
  return { ...body, receipt:\`sha256:\${digest(body)}\` };
}

/** Explicit opt-in, non-factual Worldline evidence: no facts/policies/capabilities are promoted. */
export function recordDeus0Hypothesis(worldline, report, expectedRevision = worldline?.revision?.()) {
  if (!worldline || typeof worldline.append !== 'function' || typeof worldline.revision !== 'function') fail('WORLDLINE_REQUIRED');
  if (!plain(report) || report.schema !== SCHEMA || report.epistemic !== 'hypothetical' || !report.receipt ||
      \`sha256:\${digest(Object.fromEntries(Object.entries(report).filter(([k])=>k!=='receipt')))}\` !== report.receipt) {
    return {ok:false,code:'DEUS0_RECEIPT_INVALID'};
  }
  return worldline.append({
    id:\`deus0:\${report.receipt.slice(7,31)}\`,
    kind:'simulation',
    subject:\`deus0:\${report.id}\`,
    epistemic:'hypothetical',
    scope:'simulation',
    payload:{report},
    evidence:{mode:'bounded-counterfactual',receipt:report.receipt,realWorldVerified:false},
    readSet:[],writeSet:[\`simulation:\${report.id}:\${report.receipt}\`]
  },expectedRevision);
}
