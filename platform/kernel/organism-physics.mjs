import crypto from 'node:crypto';

export const ORGANISM_LAW = Object.freeze({
  id: 'MONDAYID_ORGANISM_PHYSICS_V1',
  resident_not_running: true,
  no_direct_event_to_action: true,
  verification_required: true,
  failure_must_become_structure: true,
  learned_structure_must_remain_addressable: true,
});

const KINDS = new Set(['sentinel', 'organ', 'module', 'memory', 'law', 'antibody', 'tool', 'host', 'verifier', 'persistence']);

function uniq(values = []) { return [...new Set(values.filter(Boolean))]; }
function intersects(a = [], b = []) { const set = new Set(a); return b.some((v) => set.has(v)); }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

export function compileResidentGraph({ graph_id, nodes, edges = [] }) {
  if (!graph_id?.trim()) throw new Error('ORGANISM_GRAPH_ID_REQUIRED');
  if (!Array.isArray(nodes) || nodes.length === 0) throw new Error('ORGANISM_NODES_REQUIRED');

  const ids = new Set();
  const normalized = nodes.map((node) => {
    if (!node?.id || ids.has(node.id)) throw new Error('ORGANISM_NODE_ID_INVALID_OR_DUPLICATE');
    if (!KINDS.has(node.kind)) throw new Error(`ORGANISM_NODE_KIND_INVALID:${node.id}`);
    ids.add(node.id);
    return Object.freeze({
      id: node.id,
      kind: node.kind,
      resident: node.resident !== false,
      provides: uniq(node.provides),
      awakens_on: uniq(node.awakens_on),
      requires: uniq(node.requires),
      verifies: uniq(node.verifies),
      writes_to: uniq(node.writes_to),
      cost: Number.isFinite(node.cost) ? node.cost : 1,
    });
  });

  if (!normalized.some((n) => n.kind === 'sentinel' && n.resident)) throw new Error('ORGANISM_RESIDENT_SENTINEL_REQUIRED');

  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) throw new Error('ORGANISM_EDGE_DANGLING');
  }

  return Object.freeze({
    schema: 'mondayid.resident-organism-graph.v1',
    graph_id: graph_id.trim(),
    nodes: normalized,
    edges: edges.map((e) => Object.freeze({ ...e })),
    fingerprint: hash({ graph_id: graph_id.trim(), nodes: normalized, edges }),
  });
}

function expandDependencies(selected, byId) {
  const queue = [...selected];
  while (queue.length) {
    const id = queue.shift();
    const node = byId.get(id);
    for (const dep of node?.requires ?? []) {
      if (!byId.has(dep)) throw new Error(`ORGANISM_MISSING_DEPENDENCY:${id}->${dep}`);
      if (!selected.has(dep)) { selected.add(dep); queue.push(dep); }
    }
  }
}

export function routeEvent(graph, event) {
  if (graph?.schema !== 'mondayid.resident-organism-graph.v1') throw new Error('ORGANISM_GRAPH_INVALID');
  if (!event?.event_id || !Array.isArray(event.tags)) throw new Error('ORGANISM_EVENT_INVALID');

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const selected = new Set();

  for (const node of graph.nodes) {
    if (!node.resident) continue;
    if (node.kind === 'sentinel') selected.add(node.id);
    if (intersects(node.awakens_on, event.tags)) selected.add(node.id);
    if (intersects(node.provides, event.required_capabilities ?? [])) selected.add(node.id);
  }

  expandDependencies(selected, byId);

  const provided = new Set([...selected].flatMap((id) => byId.get(id)?.provides ?? []));
  const missing = (event.required_capabilities ?? []).filter((cap) => !provided.has(cap));
  if (missing.length) throw new Error(`ORGANISM_UNROUTABLE_CAPABILITY:${missing.join(',')}`);

  const active = [...selected].map((id) => byId.get(id)).sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
  const verification_capabilities = uniq(active.flatMap((n) => n.verifies));
  const persistence_targets = uniq(active.flatMap((n) => n.writes_to));

  return Object.freeze({
    schema: 'mondayid.route-receipt.v1',
    event_id: event.event_id,
    graph_fingerprint: graph.fingerprint,
    active_organs: active.map((n) => n.id),
    verification_capabilities,
    persistence_targets,
    route_fingerprint: hash({ event_id: event.event_id, graph: graph.fingerprint, active: active.map((n) => n.id) }),
  });
}

export function admitAction({ graph, route, action }) {
  if (!route || route.schema !== 'mondayid.route-receipt.v1') throw new Error('ORGANISM_DIRECT_ACTION_BLOCKED');
  if (route.graph_fingerprint !== graph.fingerprint) throw new Error('ORGANISM_ROUTE_GRAPH_DRIFT');
  if (route.event_id !== action?.event_id) throw new Error('ORGANISM_ACTION_EVENT_DRIFT');
  if (!action?.actuator) throw new Error('ORGANISM_ACTUATOR_REQUIRED');
  if (!Array.isArray(action.verification_plan) || action.verification_plan.length === 0) throw new Error('ORGANISM_VERIFICATION_PLAN_REQUIRED');
  if (!Array.isArray(action.writeback_plan) || action.writeback_plan.length === 0) throw new Error('ORGANISM_WRITEBACK_PLAN_REQUIRED');

  return Object.freeze({
    schema: 'mondayid.action-admission.v1',
    admitted: true,
    event_id: action.event_id,
    actuator: action.actuator,
    route_fingerprint: route.route_fingerprint,
    admission_fingerprint: hash({ route: route.route_fingerprint, action }),
  });
}

export function compileFailureGene({ event_id, failure_class, locus, invariant, evidence = [] }) {
  if (!event_id || !failure_class || !locus || !invariant) throw new Error('ORGANISM_FAILURE_GENE_FIELDS_REQUIRED');
  const signature = hash({ failure_class, locus, invariant });
  return Object.freeze({
    schema: 'mondayid.failure-gene.v1',
    event_id,
    failure_class,
    locus,
    invariant,
    evidence: uniq(evidence),
    signature,
    mutation_required_before_retry: true,
  });
}

export function admitRetry({ prior_failure_gene, mutation_receipt, next_event_id }) {
  if (prior_failure_gene?.schema !== 'mondayid.failure-gene.v1') throw new Error('ORGANISM_FAILURE_GENE_REQUIRED');
  if (!mutation_receipt || mutation_receipt.failure_signature !== prior_failure_gene.signature) {
    throw new Error('ORGANISM_UNCHANGED_RETRY_BLOCKED');
  }
  if (!mutation_receipt.changed_mechanism || !mutation_receipt.proof) throw new Error('ORGANISM_MUTATION_UNPROVEN');
  return Object.freeze({
    schema: 'mondayid.retry-admission.v1',
    admitted: true,
    next_event_id,
    prior_failure_signature: prior_failure_gene.signature,
    changed_mechanism: mutation_receipt.changed_mechanism,
    proof: mutation_receipt.proof,
  });
}

export function governedAct({ graph, route, action, execute }) {
  const admission = admitAction({ graph, route, action });
  if (typeof execute !== 'function') throw new Error('ORGANISM_EXECUTOR_REQUIRED');
  return { admission, result: execute(action) };
}
