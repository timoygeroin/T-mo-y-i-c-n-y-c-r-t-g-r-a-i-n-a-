const uniq = values => [...new Set(values.filter(Boolean))];

export function createReceptorMux({ receptors = [], name = 'mondayid-computer-mux' } = {}) {
  const active=receptors.filter(Boolean);
  if (active.length === 0) throw new TypeError('receptor mux requires at least one receptor');
  for (const receptor of active) {
    if (typeof receptor.execute !== 'function' || typeof receptor.verify !== 'function') {
      throw new TypeError('every mux receptor requires execute() and verify()');
    }
  }

  function candidates(action) {
    return active.filter(receptor => {
      if (typeof receptor.supports !== 'function') return false;
      try { return receptor.supports(action) === true; } catch { return false; }
    });
  }

  function select(action) {
    const matches=candidates(action);
    if (matches.length !== 1) return {ok:false,matches};
    return {ok:true,receptor:matches[0]};
  }

  return Object.freeze({
    name,
    exposes:uniq(active.flatMap(receptor => receptor.exposes || [])),
    cost:Math.min(...active.map(receptor => Number(receptor.cost ?? 1))),

    supports(action) {
      return select(action).ok;
    },

    async execute(action) {
      const selected=select(action);
      if (!selected.ok) {
        return {
          ok:false,
          code:selected.matches.length === 0 ? 'NO_COMPUTER_ORGAN_ROUTE' : 'AMBIGUOUS_COMPUTER_ORGAN_ROUTE',
          matches:selected.matches.map(receptor => receptor.name || 'unnamed')
        };
      }
      const result=await selected.receptor.execute(action);
      return {
        ok:result?.ok !== false,
        receptor:selected.receptor.name || 'unnamed',
        result
      };
    },

    async verify(envelope,action) {
      if (envelope?.ok !== true || !envelope?.receptor) {
        return {ok:false,code:'COMPUTER_MUX_EXECUTION_FAILED'};
      }
      const selected=active.find(receptor => (receptor.name || 'unnamed') === envelope.receptor);
      if (!selected) return {ok:false,code:'COMPUTER_MUX_RECEPTOR_LOST'};
      const verification=await selected.verify(envelope.result,action);
      return {
        ...verification,
        receptor:envelope.receptor,
        mux:name
      };
    }
  });
}
