const HEALTHY = new Set(["healthy", "degraded"]);

function normalizeNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function candidateBlockers(provider, request) {
  const blockers = [];
  const capabilities = new Set(provider.capabilities ?? []);
  for (const capability of request.required_capabilities ?? []) {
    if (!capabilities.has(capability)) blockers.push(`missing capability:${capability}`);
  }
  if (!HEALTHY.has(provider.health?.status)) blockers.push(`health:${provider.health?.status ?? "unknown"}`);
  if (provider.quota?.exhausted === true || normalizeNumber(provider.quota?.remaining, 1) <= 0) blockers.push("quota:exhausted");
  if (request.privacy?.local_only && provider.privacy?.execution !== "local") blockers.push("privacy:local-only");
  if (request.privacy?.allowed_regions?.length) {
    const region = provider.privacy?.region;
    if (!region || !request.privacy.allowed_regions.includes(region)) blockers.push(`privacy:region:${region ?? "unknown"}`);
  }
  if (request.max_cost_usd != null && normalizeNumber(provider.cost?.estimated_usd, Infinity) > request.max_cost_usd) blockers.push("cost:over-budget");
  if (request.min_reliability != null && normalizeNumber(provider.reliability?.acceptance_rate, 0) < request.min_reliability) blockers.push("reliability:below-floor");
  if (request.max_latency_ms != null && normalizeNumber(provider.latency?.p95_ms, Infinity) > request.max_latency_ms) blockers.push("latency:over-budget");
  if (request.requires_readback && provider.verification?.readback !== true) blockers.push("verification:no-readback");
  return blockers;
}

function rankTuple(provider) {
  const healthPenalty = provider.health?.status === "healthy" ? 0 : 1;
  const cost = normalizeNumber(provider.cost?.estimated_usd, Infinity);
  const reliabilityPenalty = 1 - normalizeNumber(provider.reliability?.acceptance_rate, 0);
  const latency = normalizeNumber(provider.latency?.p95_ms, Infinity);
  return [healthPenalty, cost, reliabilityPenalty, latency, provider.id];
}

function compareTuple(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

export function electProviderRoute({ request, providers }) {
  if (!request?.required_capabilities?.length) {
    return { status: "blocked", reason: "required_capabilities_missing", selected: null, fallbacks: [], rejected: [] };
  }
  const evaluated = (providers ?? []).map((provider) => ({ provider, blockers: candidateBlockers(provider, request) }));
  const eligible = evaluated.filter((entry) => entry.blockers.length === 0).map((entry) => entry.provider).sort((a, b) => compareTuple(rankTuple(a), rankTuple(b)));
  const rejected = evaluated.filter((entry) => entry.blockers.length > 0).map((entry) => ({ provider_id: entry.provider.id, blockers: entry.blockers }));
  if (eligible.length === 0) return { status: "blocked", reason: "no_eligible_provider", selected: null, fallbacks: [], rejected };
  const selected = eligible[0];
  return {
    status: "routed",
    reason: "lowest_cost_evidenced_eligible_route",
    selected: selected.id,
    fallbacks: eligible.slice(1).map((provider) => provider.id),
    rejected,
    receipt: {
      request_id: request.id,
      selected_provider: selected.id,
      required_capabilities: [...request.required_capabilities],
      health: selected.health,
      quota: selected.quota,
      cost: selected.cost,
      privacy: selected.privacy,
      reliability: selected.reliability,
      latency: selected.latency,
      verification: selected.verification,
      ranking_policy: ["health", "cost", "reliability", "latency", "stable-id"],
    },
  };
}
