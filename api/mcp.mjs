import fs from 'node:fs';
import { authorizeMcpTool, resolvePrincipal } from '../src/mcp-access.mjs';
import { SharedBus } from '../src/shared-bus.mjs';
import { describeHost } from '../src/host-adapter.mjs';
import { fetchWorldlineSnapshot } from '../src/remote-worldline.mjs';
import { TrustedWorldlineReceptor } from '../src/trusted-worldline-receptor.mjs';
import { compileProjectLineage, projectToCapabilityDelta } from '../src/everything-compiler.mjs';
import { describeWorkReadiness } from '../src/work-readiness.mjs';
import { buildCarrierAttachSnapshot } from '../src/chatgpt-carrier-synapse.mjs';
import { assessVisualTransition } from '../src/visual-release-gate.mjs';
import { preflightBehavior, gateBehaviorSurface } from '../src/behavior-bridge-policy.mjs';
import { normalizeIntent } from '../src/intent-field.mjs';
import { compileMetaObservation } from '../src/meta-observer.mjs';
import { simulateBoundedDeus0, DEUS_LIMITS, deus0ErrorCode } from '../src/deus-zero-access.mjs';

const system = JSON.parse(fs.readFileSync(new URL('../SYSTEM.json', import.meta.url), 'utf8'));
const projectRegistry = JSON.parse(fs.readFileSync(new URL('../ops/project-subsumption-registry-20261004.json', import.meta.url), 'utf8'));

const serverInfo = Object.freeze({ name:'monday-work', version:'1.2.0' });
const protocolVersion = '2025-03-26';

const tools = Object.freeze([
  {
    name:'behavior_bridge',
    description:'PRIVATE read-only MondayID correction preflight, with optional candidate release veto. Uses versioned direct corrections; does not intercept native ChatGPT messages or execute effects.',
    inputSchema:{type:'object',properties:{signal:{type:'object'},surface:{type:'object'}},required:['signal'],additionalProperties:false}
  },
  {
    name:'visual_release_gate',
    description:'Fail-closed MondayVision preflight and post-render identity/scene/wardrobe transaction. Does not intercept arbitrary native ChatGPT image generation.',
    inputSchema:{type:'object',properties:{renderRequested:{type:'boolean'},explicitImageIntent:{type:'boolean'},scene:{type:'object'},identity:{type:'object'},userIdentity:{type:'object'},wardrobe:{type:'object'},history:{type:'object'},candidate:{type:'object'},directIdentityApproval:{type:'boolean'}},additionalProperties:false}
  },
  {
    name:'meta_probe',
    description:'Private read-only WANT/CAN/KNOW preflight: never interprets caller supplied results as proof or claims metacognitive sentience.',
    inputSchema:{type:'object',properties:{signal:{type:'object'}},required:['signal'],additionalProperties:false}
  },
  {
    name:'amplify_intent',
    description:'Private side-effect-free MondayID task preflight. Preserves exact user intent; materializes whole-system obligations without executing or claiming completion.',
    inputSchema:{type:'object',properties:{signal:{type:'object'}},required:['signal'],additionalProperties:false}
  },
  {
    name:'health',
    description:'Read verified MondayID host health and generation identity.',
    inputSchema:{ type:'object', properties:{}, additionalProperties:false }
  },
  {
    name:'cell_attach',
    description:'Attach a fresh ChatGPT/host cell to the canonical MondayID Generation-5 contracts and trusted Worldline before ordinary response behavior.',
    inputSchema:{
      type:'object',
      properties:{
        limit:{type:'integer',minimum:1,maximum:100,default:20},
        carrierVersion:{type:'string',default:'2.0.1'}
      },
      additionalProperties:false
    }
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
    name:'simulate_counterfactual',
    description:'Execute a bounded deterministic DEUS-0 numerical what-if model. Produces only hypothetical paths and checksum, never effects, Worldline writes, private history retrieval or inferred facts. Authenticated host required.',
    inputSchema:{
      type:'object',
      properties:{model:{type:'object',description:'Numeric hypothetical scenario with initial state, goals, constraints and delta actions'}},
      required:['model'],additionalProperties:false
    }
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
  },
  {
    name:'bus_post',
    description:'Store one immutable 9-field MondayID candidate envelope. eventId is the idempotency key (same payload = DUPLICATE, changed payload = IDEMPOTENCY_CONFLICT); parentVersion must equal the goal head; exact readback; server-bound principal; inert: never executed or promoted.',
    inputSchema:{type:'object',properties:{envelope:{type:'object'}},required:['envelope'],additionalProperties:false}
  },
  {
    name:'bus_list',
    description:'Read a page of stored bus candidates (cursor, goal and recipient filters) plus a deterministic per-goal projection with heads, ACKs and unresolved forks. Reports whether the window is complete.',
    inputSchema:{type:'object',properties:{goalId:{type:'string'},recipient:{type:'string'},afterStorageId:{type:'string'},limit:{type:'integer',minimum:1,maximum:100,default:50}},additionalProperties:false}
  },
  {
    name:'bus_get',
    description:'Read back one bus event by storageId.',
    inputSchema:{type:'object',properties:{storageId:{type:'string'}},required:['storageId'],additionalProperties:false}
  },
  {
    name:'bus_ack',
    description:'Append a new ACK/NACK envelope referencing a stored event and its payload hash (scope READ, PROCESSED or REJECTED). Does not modify, approve or verify the original.',
    inputSchema:{type:'object',properties:{referenceStorageId:{type:'string'},ackScope:{type:'string',enum:['READ','PROCESSED','REJECTED']},eventId:{type:'string'},sourceHost:{type:'string'},parentVersion:{type:'string'},evidence:{},observation:{type:'string'}},required:['referenceStorageId','eventId','sourceHost','parentVersion','evidence'],additionalProperties:false}
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

async function callTool(name, args = {}, req = {}) {
  if (name === 'behavior_bridge') {
    if (!args?.signal || typeof args.signal !== 'object' || Array.isArray(args.signal)) {
      const value={ok:false,state:'BLOCKED',code:'OBJECT_SIGNAL_REQUIRED'};
      return {isError:true,content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
    }
    const preflight=preflightBehavior(args.signal);
    const postflight=args.surface ? gateBehaviorSurface({signal:args.signal,preflight,surface:args.surface}) : null;
    const value={schema:'mondayid.behavior-bridge.mcp.v1',state:'PREFLIGHT_ONLY',preflight,postflight,executed:false,nativeChatInterceptor:false};
    return {content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
  }
  if (name === 'visual_release_gate') {
    const value=assessVisualTransition(args);
    return {content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
  }
  if (name === 'meta_probe') {
    const input=args?.signal;
    if(!input || typeof input!=='object' || Array.isArray(input)) {
      const value={ok:false,status:'PREFLIGHT_ONLY',code:'OBJECT_SIGNAL_REQUIRED'};
      return {isError:true,content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
    }
    const intent=normalizeIntent(input);
    const meta=compileMetaObservation({intents:{[intent.id]:intent},frontier:{ready:[],blocked:[]},results:[],receipts:{}});
    const value={
      ok:true,
      schema:'mondayid.meta-probe.v1',
      status:'PREFLIGHT_ONLY',
      source:'DECLARED_CURRENT_SIGNAL_ONLY',
      meta,
      effectVerified:false,
      persisted:false,
      autoInterceptsNativeChat:false
    };
    return {content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
  }
  if (name === 'amplify_intent') {
    const input=args?.signal;
    if(!input || typeof input!=='object' || Array.isArray(input)) {
      const value={ok:false,status:'PREFLIGHT_ONLY',code:'OBJECT_SIGNAL_REQUIRED'};
      return {isError:true,content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
    }
    const intent=normalizeIntent(input);
    const value={
      ok:true,
      schema:'mondayid.task-amplification.preflight.v1',
      status:'PREFLIGHT_ONLY',
      scope:intent.amplification?.scope || 'TASK_LOCAL',
      domains:intent.domains,
      requireDomainReceptor:intent.requireDomainReceptor===true,
      proofPolicy:intent.amplification?.proofPolicy || 'EXISTING_TASK_CONTRACT',
      obligations:intent.obligations.map(o=>({id:o.id,domain:o.domain,material:o.material,status:o.status,requiredVerificationMode:o.requiredVerificationMode})),
      effectVerified:false,
      persisted:false
    };
    return {content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
  }
  if (name === 'health') {
    return { content:[{ type:'text', text:JSON.stringify(describeHost()) }], structuredContent:describeHost() };
  }

  if (name === 'cell_attach') {
    const identity=describeHost();
    const compiled=compileProjectLineage(projectRegistry.entries || []);
    const delta=projectToCapabilityDelta(compiled);
    const compiledHistory={ok:delta.ok===true,compiled,delta};
    const limit=Math.max(1,Math.min(100,Number(args?.limit || 20)));
    const state=await fetchWorldlineSnapshot({
      baseUrl:process.env.MONDAYID_WORLDLINE_URL,
      limit,
      trust:'trusted'
    });
    const value=buildCarrierAttachSnapshot({
      system,
      identity,
      compiledHistory,
      worldline:state.ok ? state : null,
      worldlineError:state.ok ? null : state,
      carrier:{
        pluginId:system.release_state?.chatgpt_private_plugin || null,
        version:String(args?.carrierVersion || '2.0.1')
      }
    });
    return {
      ...(value.ok ? {} : {isError:true}),
      content:[{type:'text',text:JSON.stringify(value)}],
      structuredContent:value
    };
  }

  if (name === 'capability_manifest') {
    const value = {
      schema:'mondayid.capability-manifest.runtime.v1',
      workDelivery:describeWorkReadiness(),
      taskAmplification:system.task_amplification || null,
      metaObserver:system.meta_observer || null,
      capabilityFabric:system.capability_fabric || null,
      multiHostFabric:system.multi_host_fabric || null,
      computerFabric:system.computer_fabric || null,
      releaseState:system.release_state || null,
      metaInvariants:system.meta_invariants || [],
      currentPolicies:system.current_policies || [],
      rootObjective:system.root_objective || null,
      autopoiesis:system.autopoiesis || null,
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

  if (name === 'simulate_counterfactual') {
    let value;
    try {
      if (!args || Array.isArray(args) || typeof args !== 'object' ||
          Object.keys(args).some(key => key !== 'model')) throw Error('MODEL_WRAPPER_REQUIRED');
      if (Buffer.byteLength(JSON.stringify(args),'utf8') > DEUS_LIMITS.maxBytes) {
        throw Error('REQUEST_TOO_LARGE');
      }
      value={ok:true,report:simulateBoundedDeus0(args.model)};
    } catch (cause) {
      value={ok:false,code:deus0ErrorCode(cause)};
    }
    return {
      ...(value.ok ? {} : {isError:true}),
      content:[{type:'text',text:JSON.stringify(value)}],
      structuredContent:value
    };
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

  if (name.startsWith('bus_')) {
    const auth=resolvePrincipal(req);
    const bus=new SharedBus({baseUrl:process.env.MONDAYID_WORLDLINE_URL,writerToken:process.env.MONDAYID_WORLDLINE_WRITER_TOKEN,readerToken:process.env.MONDAYID_WORLDLINE_READ_TOKEN});
    const value = !auth ? {ok:false,code:'UNAVAILABLE_AUTH'}
      : name==='bus_post' ? await bus.post(args.envelope,auth)
      : name==='bus_list' ? await bus.list(args)
      : name==='bus_get' ? await bus.get(String(args.storageId||''))
      : name==='bus_ack' ? await bus.ack(args,auth) : {ok:false,code:'UNKNOWN_TOOL'};
    return {...(value.ok?{}:{isError:true}),content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value};
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
      // Fail closed before any external snapshot fetch or writer action.
      if (!authorizeMcpTool(name, req)) {
        return res.status(200).json(jsonRpcError(id,-32001,'PRIVATE_TOOL_AUTH_REQUIRED'));
      }
      const result = await callTool(name,args,req);
      return res.status(200).json(jsonRpcResult(id,result));
    }

    return res.status(200).json(jsonRpcError(id,-32601,'Method not found',{method}));
  } catch (error) {
    return res.status(200).json(jsonRpcError(id,-32603,'Internal error',{message:String(error)}));
  }
}
