import { MondayRuntime } from './runtime.mjs';
import { CausalLineage, evidenceBoundDimaReference } from './causal-lineage.mjs';

const wholeGeometry = Object.freeze({
  execution: 'jarvis',
  interface: 'alisa',
  evolution: 'alpha',
  state: 'system',
  falsification: 'antisystem'
});

const defaultAnti = async ({ proposal, evidence = [] } = {}) => ({
  ok: Array.isArray(evidence) && evidence.length > 0,
  code: Array.isArray(evidence) && evidence.length > 0 ? 'COUNTEREVIDENCE_CLEAR' : 'NO_EVIDENCE'
});

export class OrganismCell {
  constructor({
    id,
    parentId = null,
    runtime = null,
    lineage = null,
    miniDima = null,
    anti = defaultAnti,
    capabilities = {},
    foundry = null
  } = {}) {
    if (!id) throw new Error('CELL_ID_REQUIRED');
    this.id = id;
    this.parentId = parentId;
    this.lineage = lineage || new CausalLineage();
    this.runtime = runtime || new MondayRuntime({ capabilities, foundry });
    this.miniDima = miniDima || evidenceBoundDimaReference(this.lineage);
    this.anti = anti;
    this.children = new Map();
    this.geometry = wholeGeometry;
  }

  describe() {
    return {
      id:this.id,
      parentId:this.parentId,
      geometry:{...this.geometry},
      wholeOrganism:true,
      childCount:this.children.size,
      worldlineRevision:this.runtime.worldline.revision(),
      policies:this.runtime.policyField.snapshot()
    };
  }

  spawn(childId, options = {}) {
    if (!childId) throw new Error('CHILD_ID_REQUIRED');
    if (this.children.has(childId)) return this.children.get(childId);

    const child = new OrganismCell({
      id:childId,
      parentId:this.id,
      lineage:this.lineage,
      miniDima:this.miniDima,
      anti:this.anti,
      capabilities:options.capabilities || {},
      foundry:options.foundry || null
    });
    this.children.set(childId, child);
    return child;
  }

  async runPass(signals, options) {
    return this.runtime.runPass(signals, options);
  }

  async evaluateMutation({
    subject = 'policy',
    mutation,
    evidence = [],
    verification = null
  } = {}) {
    if (!mutation?.id || !mutation?.statement) {
      return { ok:false, state:'REJECTED', code:'INVALID_MUTATION' };
    }

    const alphaProposal = {
      cellId:this.id,
      subject,
      mutation,
      statement:mutation.statement
    };

    const [dima, anti] = await Promise.all([
      this.miniDima({ subject, proposal:alphaProposal, evidence }),
      this.anti({ subject, proposal:alphaProposal, evidence, lineage:this.lineage })
    ]);

    if (dima?.verdict !== 'SUPPORTED') {
      return {
        ok:false,
        state:'CANDIDATE',
        code:dima?.verdict === 'CONTRADICTED' ? 'DIMA_REFERENCE_CONTRADICTION' : 'DIMA_REFERENCE_UNKNOWN',
        dima,
        anti
      };
    }
    if (anti?.ok !== true) {
      return { ok:false, state:'CANDIDATE', code:anti?.code || 'ANTI_REJECTED', dima, anti };
    }
    if (verification?.ok !== true) {
      return { ok:false, state:'CANDIDATE', code:'UNVERIFIED_MUTATION', dima, anti };
    }

    const promoted = this.runtime.mutatePolicy({
      ...mutation,
      evidence:[...new Set([...evidence, ...(dima.evidence || [])])],
      verification
    });
    if (!promoted.ok) return { ...promoted, state:'REJECTED', dima, anti };

    const cause = this.lineage.append({
      kind:'mutation',
      subject,
      signal:{ cellId:this.id, policyId:mutation.id },
      after:{ statement:mutation.statement, generation:promoted.policy.generation },
      evidence:promoted.policy.evidence,
      epistemic:'verified'
    });

    return {
      ok:true,
      state:'PROMOTED',
      cellId:this.id,
      dima,
      anti,
      policy:promoted.policy,
      receipt:promoted.receipt,
      causalEdge:cause.ok ? cause.edge : null
    };
  }
}

export const organismGeometry = wholeGeometry;
