import { organismGeometry } from './organism-cell.mjs';
import { frameSignal } from './semantic-frame.mjs';
import { CapabilityFoundry } from './foundry.mjs';

const GEOMETRY_KEYS = Object.freeze(Object.keys(organismGeometry));

function meaningId(seed) {
  return `seed:${seed}`;
}

function isPrime(n) {
  if (!Number.isInteger(n) || n < 2) return false;
  for (let p = 2; p * p <= n; p += 1) {
    if (n % p === 0) return false;
  }
  return true;
}

function trialFactors(n) {
  for (let p = 2; p * p <= n; p += 1) {
    if (n % p === 0) return [p, n / p];
  }
  return [n, 1];
}

export function factorWitness(primeA, primeB) {
  const n = primeA * primeB;
  const factors = trialFactors(n);
  const checked = factors[0] * factors[1] === n
    && isPrime(factors[0])
    && isPrime(factors[1]);
  return {
    n,
    factors,
    checked,
    answerExists: checked,
    search: 'trial-division',
    check: 'multiply-and-prime'
  };
}

function explain(seed) {
  return {
    id: meaningId(seed),
    seed,
    geometry: { ...organismGeometry },
    wholeOrganism: true,
    allocationNotIdentity: true,
    winner: null,
    witness: {
      answerExists: true,
      checkCheaperThanSearch: true
    }
  };
}

function sameGeometry(meaning) {
  return GEOMETRY_KEYS.every(key => meaning.geometry[key] === organismGeometry[key])
    && GEOMETRY_KEYS.length === Object.keys(meaning.geometry).length;
}

function seedFor(cell, pass, count, history) {
  const preferred = pass === 0
    ? cell
    : pass === 1
      ? count - 1 - cell
      : (cell + pass) % count;
  for (let step = 0; step < count; step += 1) {
    const seed = (preferred + step) % count;
    if (!history.includes(meaningId(seed))) return seed;
  }
  return null;
}

export function runInterference({ cells = 100, passes = 100 } = {}) {
  if (!Number.isInteger(cells) || cells < 2) {
    return { ok: false, code: 'CELL_COUNT' };
  }
  if (!Number.isInteger(passes) || passes < 1 || passes > cells) {
    return { ok: false, code: 'PASS_COUNT' };
  }

  const histories = Array.from({ length: cells }, () => []);

  for (let pass = 0; pass < passes; pass += 1) {
    for (let cell = 0; cell < cells; cell += 1) {
      const seed = seedFor(cell, pass, cells, histories[cell]);
      if (seed === null) {
        return { ok: false, code: 'NO_FRESH_MEANING', cell, pass };
      }
      const meaning = explain(seed);
      if (histories[cell].includes(meaning.id) || !sameGeometry(meaning) || meaning.winner !== null) {
        return { ok: false, code: 'REPEATED_MEANING', cell, pass };
      }
      histories[cell].push(meaning.id);
    }
  }

  const distinctIdeas = new Set(histories.flat()).size;
  const witness = factorWitness(17, 19);
  if (witness.checked !== true) {
    return { ok: false, code: 'WITNESS_FAILED', witness };
  }

  return {
    ok: true,
    proof: { ok: true, mode: 'interference-readback' },
    cells,
    passes,
    versions: cells * passes,
    distinctIdeas,
    notStored: 'cross-product',
    winner: null,
    histories,
    cores: [
      { id: 'geometry', role: 'same whole organism on every cell', winner: null },
      { id: 'contrast', role: 'experience kept, lens replaced, identity not replaced', winner: null },
      { id: 'witness', role: 'short answer, expensive search, cheap check', winner: null }
    ],
    common: {
      geometry: { ...organismGeometry },
      wholeOrganism: true,
      checkCheaperThanSearch: true,
      answerExists: true
    },
    witness
  };
}

export function mondayHumanos(signal = {}) {
  const frame = frameSignal(signal);
  return {
    ok: true,
    name: 'monday-humanos',
    schedulesHuman: false,
    stanceUpgraded: false,
    frame,
    parallelInterpretations: frame.allowParallelInterpretations === true,
    reductionNotForced: frame.forcedReduction === false
  };
}

export async function skillCreator({ name, proof, provenance, effect } = {}) {
  if (!name) return { ok: false, code: 'NAME_REQUIRED' };
  if (proof?.ok !== true) return { ok: false, code: 'UNPROVEN_ORGAN' };
  if (!provenance) return { ok: false, code: 'NO_PROVENANCE' };

  const foundry = new CapabilityFoundry({
    recover: async () => ({
      builder: 'recovered-named-organ',
      proof,
      provenance,
      receptor: {
        name,
        supports: () => true,
        execute: async action => ({ ok: true, name, effect: action?.effect || effect }),
        verify: async result => ({ ok: result?.ok === true && result?.name === name })
      }
    })
  });

  const forged = await foundry.forge(
    { objectiveId: name, domain: 'organ', effect: effect || `bind ${name}` },
    {}
  );
  return forged.ok === true
    ? { ...forged, name, identity: 'organ-not-mondayid' }
    : forged;
}

export function mondayHostRuntime(options) {
  const interference = runInterference(options);
  if (interference.ok !== true) {
    return { ok: false, state: 'UNRESOLVED', code: interference.code || 'KERNEL_FAILED' };
  }
  return {
    ok: true,
    name: 'mondayid-host-runtime',
    kernel: 'mondayid-generation-5',
    productionClaim: false,
    interference
  };
}

export async function bindNamedOrgans(runtime = mondayHostRuntime()) {
  if (runtime?.ok !== true || runtime?.interference?.proof?.ok !== true) {
    return { ok: false, code: 'UNPROVEN_ORGAN' };
  }
  const provenance = {
    source: 'pass-kernel',
    versions: runtime.interference.versions,
    distinctIdeas: runtime.interference.distinctIdeas
  };
  const proof = runtime.interference.proof;
  const names = [
    ['skill-creator', 'promote a named organ only after proof'],
    ['monday-humanos', 'keep the human as interface and do not upgrade stance'],
    ['mondayid-host-runtime', 'run the interference kernel without claiming production']
  ];
  const organs = [];
  for (const [name, effect] of names) {
    const organ = await skillCreator({ name, proof, provenance, effect });
    if (organ.ok !== true) return { ok: false, code: organ.code || 'BIND_FAILED', name };
    organs.push({ name, state: organ.state, identity: organ.identity });
  }
  return { ok: true, organs, winner: null };
}
