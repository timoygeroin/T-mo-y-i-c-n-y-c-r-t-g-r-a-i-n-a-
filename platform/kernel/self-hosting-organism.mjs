import crypto from 'node:crypto';
import { compileResidentGraph, routeEvent, governedAct } from './organism-physics.mjs';

const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uniq = (values = []) => [...new Set(values.filter(Boolean))];

function missingCapabilities(error) {
  const match = String(error?.message ?? error).match(/^ORGANISM_UNROUTABLE_CAPABILITY:(.+)$/);
  return match ? uniq(match[1].split(',').map((value) => value.trim())) : [];
}

function providersFor(nodes, capability) {
  return nodes.filter((node) => (node.provides ?? []).includes(capability));
}

export function createSelfHostingOrganism({ seed, buildExtension, persist, invoke }) {
  if (!seed?.graph_id || !Array.isArray(seed.nodes)) throw new Error('SELF_HOSTING_SEED_REQUIRED');
  if (typeof buildExtension !== 'function') throw new Error('SELF_HOSTING_BUILDER_REQUIRED');
  if (typeof persist !== 'function') throw new Error('SELF_HOSTING_PERSISTENCE_REQUIRED');
  if (typeof invoke !== 'function') throw new Error('SELF_HOSTING_INVOKER_REQUIRED');

  let nodes = seed.nodes.map((node) => ({ ...node }));
  let edges = (seed.edges ?? []).map((edge) => ({ ...edge }));
  let revision = 0;

  function graph() {
    return compileResidentGraph({ graph_id: `${seed.graph_id}@${revision}`, nodes, edges });
  }

  function assertSeedClosure(currentGraph) {
    const capabilities = new Set(currentGraph.nodes.flatMap((node) => node.provides ?? []));
    for (const capability of ['organism.extend', 'organism.verify-extension', 'organism.persist-registry']) {
      if (!capabilities.has(capability)) throw new Error(`SELF_HOSTING_SEED_CAPABILITY_REQUIRED:${capability}`);
    }
  }

  assertSeedClosure(graph());

  function installExtension(extension, requiredCapabilities, causeEventId) {
    if (!extension || extension.schema !== 'mondayid.extension-package.v1') {
      throw new Error('SELF_HOSTING_EXTENSION_PACKAGE_REQUIRED');
    }
    if (extension.proof?.status !== 'PASS') throw new Error('SELF_HOSTING_EXTENSION_PROOF_REQUIRED');

    const covered = new Set(extension.proof.covers ?? []);
    const uncovered = requiredCapabilities.filter((capability) => !covered.has(capability));
    if (uncovered.length) throw new Error(`SELF_HOSTING_EXTENSION_PROOF_GAP:${uncovered.join(',')}`);

    const additions = extension.nodes ?? [];
    if (!additions.length) throw new Error('SELF_HOSTING_EXTENSION_NODES_REQUIRED');
    const existingIds = new Set(nodes.map((node) => node.id));
    for (const node of additions) {
      if (!node?.id || existingIds.has(node.id)) throw new Error(`SELF_HOSTING_EXTENSION_ID_COLLISION:${node?.id ?? '<none>'}`);
      existingIds.add(node.id);
    }

    const candidateNodes = [...nodes, ...additions.map((node) => ({ ...node }))];
    for (const capability of requiredCapabilities) {
      if (!providersFor(candidateNodes, capability).length) {
        throw new Error(`SELF_HOSTING_EXTENSION_DOES_NOT_PROVIDE:${capability}`);
      }
    }

    const candidateEdges = [...edges, ...(extension.edges ?? []).map((edge) => ({ ...edge }))];
    const candidateRevision = revision + 1;
    const candidateGraph = compileResidentGraph({
      graph_id: `${seed.graph_id}@${candidateRevision}`,
      nodes: candidateNodes,
      edges: candidateEdges,
    });

    nodes = candidateNodes;
    edges = candidateEdges;
    revision = candidateRevision;

    const receipt = Object.freeze({
      schema: 'mondayid.extension-install-receipt.v1',
      cause_event_id: causeEventId,
      extension_id: extension.extension_id,
      revision,
      required_capabilities: Object.freeze([...requiredCapabilities]),
      graph_fingerprint: candidateGraph.fingerprint,
      proof_fingerprint: hash(extension.proof),
    });
    persist({ type: 'organism-extension', receipt, extension });
    return receipt;
  }

  function growFor(originalEvent, requiredCapabilities) {
    const currentGraph = graph();
    const growthEvent = {
      event_id: `${originalEvent.event_id}::grow::${revision + 1}`,
      tags: ['organism-growth'],
      required_capabilities: ['organism.extend', 'organism.verify-extension', 'organism.persist-registry'],
    };
    const growthRoute = routeEvent(currentGraph, growthEvent);
    const builder = currentGraph.nodes.find(
      (node) => growthRoute.active_organs.includes(node.id) && (node.provides ?? []).includes('organism.extend'),
    );
    if (!builder) throw new Error('SELF_HOSTING_ACTIVE_BUILDER_REQUIRED');

    const action = {
      event_id: growthEvent.event_id,
      actuator: builder.id,
      verification_plan: ['extension-proof'],
      writeback_plan: ['organism-registry'],
      payload: { original_event: originalEvent, missing_capabilities: requiredCapabilities },
    };

    const governed = governedAct({
      graph: currentGraph,
      route: growthRoute,
      action,
      execute: () => buildExtension({
        original_event: originalEvent,
        missing_capabilities: requiredCapabilities,
        graph_fingerprint: currentGraph.fingerprint,
        revision,
      }),
    });

    const receipt = installExtension(governed.result, requiredCapabilities, originalEvent.event_id);
    return Object.freeze({ growth_route: growthRoute, action_admission: governed.admission, receipt });
  }

  function dispatch(event) {
    if (!event?.event_id || !Array.isArray(event.tags)) throw new Error('SELF_HOSTING_EVENT_INVALID');
    if (!event.action?.actuator) throw new Error('SELF_HOSTING_EVENT_ACTION_REQUIRED');

    const growth = [];
    for (let round = 0; round < 8; round += 1) {
      const currentGraph = graph();
      let route;
      try {
        route = routeEvent(currentGraph, event);
      } catch (error) {
        const missing = missingCapabilities(error);
        if (!missing.length) throw error;
        growth.push(growFor(event, missing));
        continue;
      }

      if (!route.active_organs.includes(event.action.actuator)) {
        throw new Error(`SELF_HOSTING_ACTUATOR_NOT_ROUTED:${event.action.actuator}`);
      }

      const governed = governedAct({
        graph: currentGraph,
        route,
        action: { ...event.action, event_id: event.event_id },
        execute: (action) => invoke({ action, route, graph: currentGraph }),
      });

      const receipt = Object.freeze({
        schema: 'mondayid.dispatch-receipt.v1',
        event_id: event.event_id,
        revision,
        graph_fingerprint: currentGraph.fingerprint,
        route_fingerprint: route.route_fingerprint,
        admission_fingerprint: governed.admission.admission_fingerprint,
        growth: Object.freeze(growth.map((entry) => entry.receipt)),
      });
      persist({ type: 'organism-dispatch', receipt });
      return Object.freeze({ receipt, result: governed.result });
    }

    throw new Error('SELF_HOSTING_GROWTH_LIMIT_EXCEEDED');
  }

  return Object.freeze({
    dispatch,
    snapshot: () => {
      const currentGraph = graph();
      return Object.freeze({ revision, graph_fingerprint: currentGraph.fingerprint, nodes: currentGraph.nodes });
    },
  });
}
