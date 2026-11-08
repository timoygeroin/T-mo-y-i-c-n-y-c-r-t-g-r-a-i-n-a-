/**
 * QuantumOrganism — living self-building organ for MondayID
 * Atoms → Cells → Neurons → Neutrons
 * Every cycle must increase fitness, density or transferability.
 * Evidence-bound. No self-certification.
 * Cell is not the genome.
 */

export class Atom {
  constructor(kind, payload, energy = 1.0, phase = 0.0) {
    this.kind = kind; // 'op' | 'const' | 'link' | 'neutron'
    this.payload = payload;
    this.energy = energy;
    this.phase = phase;
  }

  mutate() {
    this.phase += (Math.random() - 0.5) * 0.6;
    this.energy *= 0.85 + Math.random() * 0.3;
    if (this.kind === 'op') {
      const ops = ['add', 'mul', 'sin', 'tanh', 'exp'];
      this.payload = ops[Math.floor(Math.random() * ops.length)];
    } else if (this.kind === 'const') {
      this.payload = (Math.random() - 0.5) * 4;
    }
  }
}

export class QuantumCell {
  constructor(atoms = [], generation = 0) {
    this.atoms = atoms;
    this.generation = generation;
    this.fitness = 0;
    this.id = Math.random().toString(36).slice(2, 10);
  }

  static birth(size = 6) {
    const kinds = ['op', 'const', 'link', 'neutron'];
    const atoms = [];
    for (let i = 0; i < size; i++) {
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      let payload;
      if (kind === 'op') payload = ['add', 'mul', 'sin', 'tanh'][Math.floor(Math.random() * 4)];
      else if (kind === 'const') payload = (Math.random() - 0.5) * 2;
      else payload = Math.floor(Math.random() * 4);
      atoms.push(new Atom(kind, payload, 0.5 + Math.random()));
    }
    return new QuantumCell(atoms);
  }

  evaluate(inputs = [0]) {
    let state = inputs.reduce((a, b) => a + b, 0);
    for (const atom of this.atoms) {
      if (atom.kind === 'op') {
        if (atom.payload === 'add') state += atom.energy;
        else if (atom.payload === 'mul') state *= atom.energy;
        else if (atom.payload === 'sin') state = Math.sin(state + atom.phase);
        else if (atom.payload === 'tanh') state = Math.tanh(state);
        else if (atom.payload === 'exp') state = Math.exp(Math.min(state, 4)) * 0.1;
      } else if (atom.kind === 'const') {
        state += atom.payload * atom.energy;
      } else if (atom.kind === 'neutron') {
        state *= 0.9 + 0.1 * Math.cos(atom.phase);
      }
    }
    return state;
  }

  fitnessAgainst(targetFn, samples = 16) {
    let error = 0;
    for (let i = 0; i < samples; i++) {
      const x = [Math.random() * 4 - 2, Math.random() * 4 - 2, Math.random() * 4 - 2];
      const pred = this.evaluate(x);
      const truth = targetFn(x);
      error += (pred - truth) ** 2;
    }
    this.fitness = 1 / (1 + error / samples);
    return this.fitness;
  }

  replicate() {
    const child = new QuantumCell(
      this.atoms.map(a => new Atom(a.kind, a.payload, a.energy, a.phase)),
      this.generation + 1
    );
    if (child.atoms.length && Math.random() < 0.45) {
      child.atoms[Math.floor(Math.random() * child.atoms.length)].mutate();
    }
    if (Math.random() < 0.25) {
      child.atoms.push(new Atom('op', ['add', 'sin', 'mul'][Math.floor(Math.random() * 3)]));
    }
    if (child.atoms.length > 14 && Math.random() < 0.2) {
      child.atoms.splice(Math.floor(Math.random() * child.atoms.length), 1);
    }
    return child;
  }
}

export class QuantumOrganism {
  constructor(popSize = 12) {
    this.cells = Array.from({ length: popSize }, () => QuantumCell.birth(5 + Math.floor(Math.random() * 4)));
    this.generation = 0;
    this.history = [];
  }

  evolve(targetFn, cycles = 30) {
    for (let c = 0; c < cycles; c++) {
      for (const cell of this.cells) cell.fitnessAgainst(targetFn);
      this.cells.sort((a, b) => b.fitness - a.fitness);
      const best = this.cells[0].fitness;
      this.history.push(best);

      const elites = this.cells.slice(0, 4);
      const next = [...elites];
      while (next.length < this.cells.length) {
        next.push(elites[Math.floor(Math.random() * elites.length)].replicate());
      }
      this.cells = next;
      this.generation++;
    }
    return this.best();
  }

  best() {
    return this.cells.reduce((a, b) => a.fitness > b.fitness ? a : b);
  }

  exportGenome() {
    const best = this.best();
    return {
      generation: this.generation,
      bestFitness: best.fitness,
      atoms: best.atoms.map(a => ({
        kind: a.kind,
        payload: a.payload,
        energy: Number(a.energy.toFixed(4))
      })),
      peak: Math.max(...this.history, 0)
    };
  }

  static fromGenome(genome) {
    const atoms = (genome.atoms || []).map(a => new Atom(a.kind, a.payload, a.energy));
    const cell = new QuantumCell(atoms, genome.generation || 0);
    const org = new QuantumOrganism(1);
    org.cells = [cell];
    org.generation = genome.generation || 0;
    return org;
  }
}

// Default target for self-test (replaceable)
export const defaultTarget = (x) => Math.sin(x[0]) * 0.7 + x[1] * 0.3 + Math.cos(x[2] * 0.5);
