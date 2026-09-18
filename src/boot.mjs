import { MondayRuntime } from './runtime.mjs';
import { renderHumanSurface } from './interface.mjs';

const runtime = new MondayRuntime({
  capabilities: {
    general: {
      name: 'local-proof-receptor',
      execute: async (action) => ({ effect: action.effect, accepted: true }),
      verify: async (result) => ({ ok: result.accepted === true })
    }
  }
});

const out = await runtime.cycle([{ id:'boot', text:'boot MondayID unified organism', effect:'prove unified runtime boots' }]);
console.log(JSON.stringify(renderHumanSurface(out), null, 2));
