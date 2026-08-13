import { createHash } from "node:crypto";

const RISK_RANK = Object.freeze({ low: 0, medium: 1, high: 2, critical: 3 });

function stableHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(value, Object.keys(value).sort()))
    .digest("hex")
    .slice(0, 16);
}

function unique(values) {
  return [...new Set(values)];
}

function assertCapability(capability) {
  if (!capability || typeof capability !== "object") {
    throw new TypeError("Capability must be an object");
  }
  if (!capability.id || !capability.platform) {
    throw new TypeError("Capability requires id and platform");
  }
  if (!Array.isArray(capability.provides) || capability.provides.length === 0) {
    throw new TypeError(`Capability ${capability.id} must provide at least one atomic ability`);
  }
  if (typeof capability.execute !== "function") {
    throw new TypeError(`Capability ${capability.id} requires an execute function`);
  }
}

export function createCapabilityRegistry(capabilities) {
  const registry = new Map();
  for (const raw of capabilities) {
    assertCapability(raw);
    if (registry.has(raw.id)) {
      throw new Error(`Duplicate capability id: ${raw.id}`);
    }
    registry.set(raw.id, Object.freeze({
      risk: "low",
      mutates: false,
      cost: 1,
      latency: 1,
      dependsOn: [],
      ...raw,
      provides: unique(raw.provides),
      dependsOn: unique(raw.dependsOn ?? []),
    }));
  }
  return registry;
}

function isAllowed(capability, policy) {
  if (capability.mutates && !policy.allowMutations) return false;
  return RISK_RANK[capability.risk] <= RISK_RANK[policy.maxRisk];
}

function covers(capability, needs) {
  return capability.provides.filter((ability) => needs.has(ability));
}

function capabilityScore(capability, uncovered) {
  const gain = covers(capability, uncovered).length;
  const riskPenalty = RISK_RANK[capability.risk] * 8;
  const mutationPenalty = capability.mutates ? 5 : 0;
  return gain * 100 - capability.cost * 7 - capability.latency * 3 - riskPenalty - mutationPenalty;
}

function topologicalOrder(selected, registry) {
  const selectedIds = new Set(selected.map((step) => step.capabilityId));
  const visiting = new Set();
  const visited = new Set();
  const ordered = [];

  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Capability dependency cycle detected at ${id}`);
    visiting.add(id);
    const capability = registry.get(id);
    for (const dependency of capability.dependsOn) {
      if (selectedIds.has(dependency)) visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
    ordered.push(selected.find((step) => step.capabilityId === id));
  }

  for (const step of selected) visit(step.capabilityId);
  return ordered;
}

export function planIntent({ intent, registry, policy = {} }) {
  if (!intent?.goal || !Array.isArray(intent.needs) || intent.needs.length === 0) {
    throw new TypeError("Intent requires goal and at least one atomic need");
  }

  const effectivePolicy = Object.freeze({
    allowMutations: false,
    maxRisk: "medium",
    materializeCompositeTool: true,
    ...policy,
  });

  if (!(effectivePolicy.maxRisk in RISK_RANK)) {
    throw new TypeError(`Unknown maxRisk: ${effectivePolicy.maxRisk}`);
  }

  const required = new Set(unique(intent.needs));
  const allCapabilities = [...registry.values()];
  const allowed = allCapabilities.filter((capability) => isAllowed(capability, effectivePolicy));
  const blocked = allCapabilities.filter((capability) => !isAllowed(capability, effectivePolicy));

  const exactCandidates = allowed
    .filter((capability) => [...required].every((need) => capability.provides.includes(need)))
    .sort((a, b) => capabilityScore(b, required) - capabilityScore(a, required));

  let selected = [];
  let uncovered = new Set(required);

  if (exactCandidates.length > 0) {
    const exact = exactCandidates[0];
    selected = [{ capabilityId: exact.id, covers: [...required] }];
    uncovered.clear();
  } else {
    const remaining = new Set(allowed.map((capability) => capability.id));
    while (uncovered.size > 0) {
      const candidate = [...remaining]
        .map((id) => registry.get(id))
        .filter((capability) => covers(capability, uncovered).length > 0)
        .sort((a, b) => capabilityScore(b, uncovered) - capabilityScore(a, uncovered))[0];

      if (!candidate) break;
      const gained = covers(candidate, uncovered);
      selected.push({ capabilityId: candidate.id, covers: gained });
      gained.forEach((need) => uncovered.delete(need));
      remaining.delete(candidate.id);
    }
  }

  const blockedCoverage = [...uncovered].filter((need) =>
    blocked.some((capability) => capability.provides.includes(need)),
  );

  const base = {
    planId: `mondayid-one:${stableHash({ goal: intent.goal, needs: [...required], selected })}`,
    goal: intent.goal,
    required: [...required],
    policy: effectivePolicy,
    blockedCapabilities: blocked
      .filter((capability) => capability.provides.some((need) => required.has(need)))
      .map((capability) => ({
        id: capability.id,
        platform: capability.platform,
        risk: capability.risk,
        mutates: capability.mutates,
        provides: capability.provides,
      })),
  };

  if (uncovered.size > 0) {
    return Object.freeze({
      ...base,
      status: blockedCoverage.length > 0 ? "human_gate" : "missing_capability",
      mode: "blocked",
      steps: [],
      unresolved: [...uncovered],
      humanGate: blockedCoverage.length > 0
        ? {
            reason: "Required abilities exist only behind the active mutation or risk policy",
            needs: blockedCoverage,
          }
        : null,
      ephemeralTool: null,
    });
  }

  const ordered = topologicalOrder(selected, registry).map((step, index) => {
    const capability = registry.get(step.capabilityId);
    return Object.freeze({
      order: index + 1,
      capabilityId: capability.id,
      platform: capability.platform,
      covers: step.covers,
      mutates: capability.mutates,
      risk: capability.risk,
    });
  });

  const mode = ordered.length === 1 ? "exact" : "composite";
  const ephemeralTool = mode === "composite" && effectivePolicy.materializeCompositeTool
    ? Object.freeze({
        id: `tool.one.${stableHash(ordered)}`,
        lifecycle: intent.reuse === "reusable" ? "reusable" : "one-shot",
        description: `Generated capability composition for: ${intent.goal}`,
        steps: ordered.map((step) => step.capabilityId),
      })
    : null;

  return Object.freeze({
    ...base,
    status: "ready",
    mode,
    steps: ordered,
    unresolved: [],
    humanGate: null,
    ephemeralTool,
  });
}

export function materializeTool(plan, registry) {
  if (plan.status !== "ready") {
    throw new Error(`Cannot materialize a ${plan.status} plan`);
  }

  const toolId = plan.ephemeralTool?.id ?? `tool.exact.${plan.planId.split(":").at(-1)}`;

  return Object.freeze({
    id: toolId,
    lifecycle: plan.ephemeralTool?.lifecycle ?? "bound",
    async execute(input = {}) {
      const results = {};
      const trace = [];

      for (const step of plan.steps) {
        const capability = registry.get(step.capabilityId);
        const startedAt = Date.now();
        const output = await capability.execute({
          input,
          results: Object.freeze({ ...results }),
          plan,
          step,
        });
        results[capability.id] = output;
        trace.push(Object.freeze({
          capabilityId: capability.id,
          platform: capability.platform,
          covers: step.covers,
          durationMs: Date.now() - startedAt,
          output,
        }));
      }

      return Object.freeze({
        toolId,
        planId: plan.planId,
        status: "executed",
        platforms: unique(plan.steps.map((step) => step.platform)),
        trace,
        result: trace.at(-1)?.output ?? null,
      });
    },
  });
}

export function summarizePlan(plan) {
  return Object.freeze({
    result: plan.status === "ready" ? "ROUTE_COMPILED" : "ROUTE_BLOCKED",
    planId: plan.planId,
    mode: plan.mode,
    capabilities: plan.steps.map((step) => step.capabilityId),
    platforms: unique(plan.steps.map((step) => step.platform)),
    ephemeralTool: plan.ephemeralTool,
    unresolved: plan.unresolved,
    humanGate: plan.humanGate,
  });
}
