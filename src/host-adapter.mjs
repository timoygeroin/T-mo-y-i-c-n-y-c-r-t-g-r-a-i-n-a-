import fs from 'node:fs';
import { MondayRuntime } from './runtime.mjs';
import { OrganismCell } from './organism-cell.mjs';
import { renderHumanSurface } from './interface.mjs';
import { recoverWorldline } from './remote-worldline.mjs';

const system = JSON.parse(fs.readFileSync(new URL('../SYSTEM.json', import.meta.url), 'utf8'));

export function describeHost({ env = process.env } = {}) {
  return {
    ok: true,
    product: system.product,
    generation: system.generation,
    rewrite: system.rewrite === true,
    runtime_dependency_on_legacy: system.runtime_dependency_on_legacy === true,
    kernel: 'mondayid-generation-5',
    runtime: 'vercel-node-function',
    continuity: {
      trusted_worldline_configured: Boolean(env.MONDAYID_WORLDLINE_URL),
      trusted_writer_configured: Boolean(env.MONDAYID_WORLDLINE_WRITER_TOKEN),
      schema: system.continuity?.external_snapshot_schema || null,
      transport: system.continuity?.current_transport || null
    },
    authority: {
      no_spend: Array.isArray(system.authority?.explicit_exclusions)
        && system.authority.explicit_exclusions.includes('spending_money')
    },
    cutover: 'generation-5'
  };
}

export async function bootHost({
  env = process.env,
  fetchImpl = globalThis.fetch,
  signal = { id:'host-boot', text:'boot MondayID generation 5 host', effect:'prove delivered generation 5 runtime' }
} = {}) {
  const identity = describeHost({ env });
  const baseUrl = env.MONDAYID_WORLDLINE_URL;

  if (!baseUrl) {
    return {
      ok: false,
      state: 'UNRESOLVED',
      code: 'WORLDLINE_URL_MISSING',
      status: 503,
      identity
    };
  }

  const recovered = await recoverWorldline({
    baseUrl,
    limit: 10,
    trust: 'trusted',
    fetchImpl
  });

  if (!recovered.ok) {
    return {
      ok: false,
      state: 'UNRESOLVED',
      code: recovered.code || 'WORLDLINE_RECOVERY_FAILED',
      status: recovered.status || 503,
      identity
    };
  }

  const runtime = new MondayRuntime({
    worldline: recovered.worldline,
    capabilities: {
      general: {
        name: 'generation-5-host-proof-receptor',
        execute: async action => ({ accepted:true, effect:action.effect, domain:action.domain }),
        verify: async result => ({ ok:result?.accepted === true, mode:'host-proof-readback' })
      }
    }
  });

  const cell = new OrganismCell({ id:'mondayid:vercel-host', runtime });
  const pass = await cell.runPass([signal]);
  const surface = renderHumanSurface(pass.final);

  return {
    ok: pass.ok === true && pass.state === 'FULFILLED',
    state: pass.state,
    reason: pass.reason,
    identity,
    worldline: {
      trust: recovered.trust,
      schema: recovered.snapshot?.schema || null,
      imported: recovered.imported ?? null,
      generated_at: recovered.snapshot?.generatedAtIso || null
    },
    organism: cell.describe(),
    pass: {
      cycles: pass.cycles?.length || 0,
      state: pass.state,
      reason: pass.reason
    },
    surface
  };
}
