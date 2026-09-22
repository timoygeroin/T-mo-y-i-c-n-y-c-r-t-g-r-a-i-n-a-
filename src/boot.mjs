import { MondayRuntime } from './runtime.mjs';
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
      execute: async (action) => ({ effect: action.effect, accepted: true }),
      verify: async (result) => ({ ok: result.accepted === true })
    }
  }
});

const pass = await runtime.runPass([{
  id:'boot',
  text:'boot MondayID unified organism',
  effect:'prove unified runtime boots'
}]);
const surface = renderHumanSurface(pass.final);
console.log(JSON.stringify({ pass:{ state:pass.state, reason:pass.reason, cycles:pass.cycles.length }, surface }, null, 2));
