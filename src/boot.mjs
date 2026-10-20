import { MondayRuntime } from './runtime.mjs';
import { OrganismCell } from './organism-cell.mjs';
import { renderHumanSurface } from './interface.mjs';
import { recoverWorldline } from './remote-worldline.mjs';

let worldline;
if (process.env.MONDAYID_WORLDLINE_URL) {
  const recovered = await recoverWorldline({ baseUrl:process.env.MONDAYID_WORLDLINE_URL, limit:10 });
  if (!recovered.ok) {
    console.error(JSON.stringify({ state:'UNRESOLVED', stage:'recover-worldline', code:recovered.code, status:recovered.status ?? null }));
    process.exit(1);
  }
  worldline = recovered.worldline;
}

const runtime = new MondayRuntime({
  worldline,
  capabilities: {
    general: {
      name: 'local-proof-receptor',
      // Diagnostic only: a local echo is not an independently observed effect.
      // Keep the action unresolved until a real receptor and readback exist.
      execute: async (action) => ({
        ok: false,
        code: 'BOOT_DIAGNOSTIC_ONLY_NO_REAL_EFFECT',
        requestedEffect: action.effect
      }),
      verify: async () => ({
        ok: false,
        code: 'INDEPENDENT_EFFECT_READBACK_REQUIRED'
      })
    }
  }
});

const root = new OrganismCell({
  id:'mondayid:root',
  runtime
});

const pass = await root.runPass([{
  id:'boot',
  text:'boot MondayID unified organism',
  effect:'prove unified runtime boots'
}]);
const surface = renderHumanSurface(pass.final);
console.log(JSON.stringify({
  organism:root.describe(),
  pass:{ state:pass.state, reason:pass.reason, cycles:pass.cycles.length },
  surface
}, null, 2));
