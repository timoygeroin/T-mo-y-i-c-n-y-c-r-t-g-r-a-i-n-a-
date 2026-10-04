import fs from 'node:fs';
import { describeHost } from '../src/host-adapter.mjs';
import { fetchWorldlineSnapshot } from '../src/remote-worldline.mjs';
import { TrustedWorldlineReceptor } from '../src/trusted-worldline-receptor.mjs';
import { compileProjectLineage, projectToCapabilityDelta } from '../src/everything-compiler.mjs';

const system = JSON.parse(fs.readFileSync(new URL('../SYSTEM.json', import.meta.url), 'utf8'));
const projectRegistry = JSON.parse(fs.readFileSync(new URL('../ops/project-subsumption-registry-20261004.json', import.meta.url), 'utf8'));

const serverInfo = Object.freeze({ name:'monday-work', version:'1.1.0' });
const protocolVersion = '2025-03-26';

const tools = Object.freeze([
  {
    name:'health',
    description:'Read verified MondayID host health and generation identity.',
    inputSchema:{ type:'object', properties:{}, additionalProperties:false }
  },
  {
    name:'capability_manifest',
    description:'Read the canonical Monday-owned capability and multi-host fabric contracts.',
    inputSchema:{ type:'object', properties:{}, additionalProperties:false }
  },
  {
    name:'compile_history',
    description:'Compile historical MondayID project names into current reusable capabilities, roles, donors, failure genes, gates, and explicit unknowns. Project names retain no runtime authority.',
    inputSchema:{ type:'object', properties:{}, additionalProperties:false }
  },
  {
    name:'get_state',
    description:'Read the trusted external MondayID worldline snapshot. This is read-only.',
    inputSchema:{
      type:'object',
      properties:{ limit:{type:'integer',minimum:1,maximum:100,default:20} },
      additionalProperties:false
    }
  },
  {
    name:'prove_trusted_write_readback',
    description:'Persist one bounded MondayID continuity proof through the authenticated Worldline writer and verify the exact event by independent readback. No arbitrary state payload is accepted.',
    inputSchema:{ type:'object', properties:{}, additionalProperties:false }
  }
]);

function jsonRpcResult(id, result) {
  return { jsonrpc:'2.0', id, result };
}

function jsonRpcError(id, code, message, data = undefined) {
  return {
    jsonrpc:'2.0',
    id:id ?? null,
    error:{ code, message, ...(data === undefined ? {} : { data }) }
  };
}

async function callTool(name, args = {}) {
  if (name === 'health') {
    return { content:[{ type:'text', text:JSON.stringify(describeHost()) }], structuredContent:describeHost() };
  }

  if (name === 'capability_manifest') {
    const value = {
      schema:'mondayid.capability-manifest.runtime.v1',
      capabilityFabric:system.capability_fabric || null,
      multiHostFabric:system.multi_host_fabric || null,
      computerFabric:system.computer_fabric || null,
      releaseState:system.release_state || null,
      metaInvariants:system.meta_invariants || [],
      currentPolicies:system.current_policies || [],
      continuity:system.continuity || null,
      everythingCompiler:system.everything_compiler || null,
      physiology:system.physiology || null,
      organismPhysics:system.organism_physics || null,
      organismSynapse:system.organism_synapse || null,
      reentryAndResponse:system.reentry_and_response || null,
      visualPhenotype:system.visual_phenotype || null,
      authorityMembrane:system.authority_membrane || null,
      metabolism:system.physiology?.metabolism || null,
      hostHomeostasis:system.multi_host_fabric?.homeostasis || null
    };
    return { content:[{ type:'text', text:JSON.stringify(value) }], structuredContent:value };
  }

  if (name === 'compile_history') {
    const compiled=compileProjectLineage(projectRegistry.entries || []);
    const delta=projectToCapabilityDelta(compiled);
    const value={ok:delta.ok===true,compiled,delta};
    return {content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
  }

  if (name === 'get_state') {
    const limit = Math.max(1, Math.min(100, Number(args?.limit || 20)));
    const state = await fetchWorldlineSnapshot({
      baseUrl:process.env.MONDAYID_WORLDLINE_URL,
      limit,
      trust:'trusted'
    });
    if (!state.ok) {
      return {
        isError:true,
        content:[{ type:'text', text:JSON.stringify(state) }],
        structuredContent:state
      };
    }
    const value = {
      ok:true,
      trust:state.trust,
      url:state.url,
      snapshot:state.snapshot
    };
    return { content:[{ type:'text', text:JSON.stringify(value) }], structuredContent:value };
  }

  if (name === 'prove_trusted_write_readback') {
    const receptor = new TrustedWorldlineReceptor({
      baseUrl:process.env.MONDAYID_WORLDLINE_URL,
      token:process.env.MONDAYID_WORLDLINE_WRITER_TOKEN,
      host:'monday-work-mcp',
      identityFingerprint:'mondayid:rewrite:g5',
      sourceRef:'monday-work:mcp:trusted-write-readback'
    });
    const action = {
      objectiveId:'monday-work:trusted-write-readback',
      sourceSignal:'monday-work:mcp:proof',
      domain:'continuity',
      effect:'prove this MCP host can persist and exact-readback one authenticated external effect'
    };
    const write = await receptor.execute(action);
    if (!write.ok) {
      const value = {
        ok:false,
        stage:'write',
        code:write.code,
        status:write.status ?? null
      };
      return {
        isError:true,
        content:[{type:'text',text:JSON.stringify(value)}],
        structuredContent:value
      };
    }
    const verification = await receptor.verify(write);
    if (!verification.ok) {
      const value = {
        ok:false,
        stage:'readback',
        writeStatus:write.status,
        eventId:write.event?.eventId ?? null,
        verification
      };
      return {
        isError:true,
        content:[{type:'text',text:JSON.stringify(value)}],
        structuredContent:value
      };
    }
    const value = {
      ok:true,
      writeStatus:write.status,
      eventId:write.event.eventId,
      verification
    };
    return {content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
  }

  return {
    isError:true,
    content:[{ type:'text', text:JSON.stringify({ok:false,code:'UNKNOWN_TOOL',name}) }],
    structuredContent:{ok:false,code:'UNKNOWN_TOOL',name}
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('MCP-Protocol-Version',protocolVersion);

  if (req.method === 'GET') {
    return res.status(200).json({
      ok:true,
      transport:'streamable-http',
      protocolVersion,
      serverInfo,
      tools:tools.map(tool=>tool.name)
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow','GET, POST');
    return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED'});
  }

  const body = req.body || {};
  const id = body.id ?? null;
  const method = String(body.method || '');

  try {
    if (method === 'initialize') {
      return res.status(200).json(jsonRpcResult(id,{
        protocolVersion,
        capabilities:{ tools:{ listChanged:false } },
        serverInfo,
        instructions:'Monday Work is a host-neutral MondayID control-plane endpoint. Attempted is not verified.'
      }));
    }

    if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
      return res.status(202).end();
    }

    if (method === 'ping') {
      return res.status(200).json(jsonRpcResult(id,{}));
    }

    if (method === 'tools/list') {
      return res.status(200).json(jsonRpcResult(id,{ tools }));
    }

    if (method === 'tools/call') {
      const name = String(body.params?.name || '');
      const args = body.params?.arguments || {};
      const result = await callTool(name,args);
      return res.status(200).json(jsonRpcResult(id,result));
    }

    return res.status(200).json(jsonRpcError(id,-32601,'Method not found',{method}));
  } catch (error) {
    return res.status(200).json(jsonRpcError(id,-32603,'Internal error',{message:String(error)}));
  }
}
