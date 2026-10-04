import fs from 'node:fs';
import { describeHost } from '../src/host-adapter.mjs';
import { fetchWorldlineSnapshot } from '../src/remote-worldline.mjs';

const system = JSON.parse(fs.readFileSync(new URL('../SYSTEM.json', import.meta.url), 'utf8'));

const serverInfo = Object.freeze({ name:'monday-work', version:'1.0.0' });
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
    name:'get_state',
    description:'Read the trusted external MondayID worldline snapshot. This is read-only.',
    inputSchema:{
      type:'object',
      properties:{ limit:{type:'integer',minimum:1,maximum:100,default:20} },
      additionalProperties:false
    }
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
      continuity:system.continuity || null
    };
    return { content:[{ type:'text', text:JSON.stringify(value) }], structuredContent:value };
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
