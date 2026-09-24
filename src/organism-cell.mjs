import { MondayRuntime } from './runtime.mjs';
import { CausalLineage, evidenceBoundDimaReference } from './causal-lineage.mjs';
import { RootContinuityContract } from './root-continuity.mjs';

const wholeGeometry = Object.freeze({
  execution:'jarvis',
  interface:'alisa',
  evolution:'alpha',
  state:'system',
  falsification:'antisystem'
});

const defaultAnti = async ({ evidence = [] } = {}) => ({
  ok:Array.isArray(evidence) && evidence.length > 0,
  code:Array.isArray(evidence) && evidence.length > 0 ? 'COUNTEREVIDENCE_CLEAR' : 'NO_EVIDENCE'
});

export class OrganismCell {
  constructor({
    id,
    parentId = null,
    runtime = null,
    lineage = null,
    rootContract = null,
    miniDima = null,
    anti = defaultAnti,
    capabilities = {},
    foundry = null,
    head = null
  } = {}) {
    if (!id) throw new Error('CELL_ID_REQUIRED');
    this.id = id;
    this.parentId = parentId;
    this.lineage = lineage || new CausalLineage();
    this.rootContract = rootContract || this.lineage.rootContract || new RootContinuityContract();
    this.runtime = runtime || new MondayRuntime({ capabilities, foundry, cellId:id });
    this.runtime.cellId = id;
    this.miniDima = miniDima || evidenceBoundDimaReference(this.lineage);
    this.anti = anti;
    this.children = new Map();
    this.geometry = wholeGeometry;
    this.head = head || this.runtime.worldline.cellHead(id) || this.runtime.worldline.revision();
    this.runtime.worldline.fork(id, this.head);
  }

  describe() {
    return {
      id:this.id,
      parentId:this.parentId,
      geometry:{...this.geometry},
      wholeOrganism:true,
      childCount:this.children.size,
      worldlineRevision:this.runtime.worldline.revision(),
      cellHead:this.head,
      worldlineHeads:this.runtime.worldline.heads(),
      identity:this.lineage.identity(),
      rootContinuity:this.rootContract.snapshot(),
      policies:this.runtime.policyField.snapshot()
    };
  }

  spawn(childId, options = {}) {
    if (!childId) throw new Error('CHILD_ID_REQUIRED');
    if (this.children.has(childId)) return this.children.get(childId);

    const childHead = options.head || this.head;
    const childRuntime = options.runtime || new MondayRuntime({
      worldline:this.runtime.worldline,
      policyField:this.runtime.policyField,
      actionLedger:this.runtime.actionLedger,
      capabilities:options.capabilities || {},
      foundry:options.foundry || null,
      cellId:childId
    });

    const child = new OrganismCell({
      id:childId,
      parentId:this.id,
      runtime:childRuntime,
      lineage:this.lineage,
      rootContract:this.rootContract,
      miniDima:this.miniDima,
      anti:this.anti,
      head:childHead
    });
    this.children.set(childId, child);
    return child;
  }

  commitEvent(event, options = {}) {
    const out = this.runtime.worldline.commit(event,{
      baseRevision:options.baseRevision || this.head,
      cellId:this.id,
      readSet:options.readSet ?? event?.readSet ?? null,
      writeSet:options.writeSet ?? event?.writeSet ?? null,
      scope:options.scope ?? event?.scope ?? null,
      strategy:options.strategy || 'auto'
    });

    if (out.ok && out.revision) this.head = out.revision;
    else if (out.branchRevision) this.head = out.branchRevision;
    return out;
  }

  reconcileWith(sourceRevision, options = {}) {
    const out = this.runtime.worldline.reconcile({
      sourceRevision,
      targetRevision:options.targetRevision || this.runtime.worldline.revision(),
      cellId:this.id,
      resolution:options.resolution || null
    });
    if (out.ok && out.revision) this.head = out.revision;
    return out;
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

    const scope = mutation.scope || 'organism';
    const alphaProposal = {
      cellId:this.id,
      subject,
      mutation,
      statement:mutation.statement,
      scope
    };

    const [dima, anti] = await Promise.all([
      this.miniDima({ subject, proposal:alphaProposal, evidence }),
      this.anti({ subject, proposal:alphaProposal, evidence, lineage:this.lineage })
    ]);

    if (dima?.verdict !== 'SUPPORTED') {
      return {
        ok:false,
        state:'CANDIDATE',
        code:dima?.verdict === 'CONTRADICTED'
          ? 'DIMA_REFERENCE_CONTRADICTION'
          : 'DIMA_REFERENCE_UNKNOWN',
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

    const continuity = this.rootContract.validateMutation({
      mutation:{ ...mutation, scope },
      evidence:[...new Set([...evidence, ...(dima.evidence || [])])],
      verification,
      parentState:{
        policies:this.runtime.policyField.snapshot(),
        identity:this.lineage.identity()
      },
      nextState:{
        subject,
        statement:mutation.statement,
        scope
      }
    });
    if (!continuity.ok) {
      return {
        ok:false,
        state:'CANDIDATE',
        code:continuity.code,
        dima,
        anti,
        continuity
      };
    }

    const promoted = this.runtime.mutatePolicy({
      ...mutation,
      scope,
      evidence:[...new Set([...evidence, ...(dima.evidence || [])])],
      verification
    });
    if (!promoted.ok) return { ...promoted, state:'REJECTED', dima, anti, continuity };

    const parentHeads = Array.isArray(mutation.parents)
      ? mutation.parents
      : this.lineage.heads({ acceptedOnly:true });

    const cause = this.lineage.append({
      kind:'mutation',
      subject,
      signal:{ cellId:this.id, policyId:mutation.id },
      before:null,
      after:{
        statement:mutation.statement,
        generation:promoted.policy.generation,
        rootId:this.rootContract.rootId
      },
      evidence:promoted.policy.evidence,
      parents:parentHeads,
      epistemic:'verified',
      scope,
      verification,
      provenance:[
        `cell:${this.id}`,
        `policy-receipt:${promoted.receipt.id}`
      ],
      writeSet:[`policy:${mutation.id}`]
    });

    if (!cause.ok) {
      return {
        ok:false,
        state:'REJECTED',
        code:cause.code || 'LINEAGE_COMMIT_FAILED',
        dima,
        anti,
        continuity,
        policy:promoted.policy,
        receipt:promoted.receipt
      };
    }

    return {
      ok:true,
      state:'PROMOTED',
      cellId:this.id,
      dima,
      anti,
      continuity,
      policy:promoted.policy,
      receipt:promoted.receipt,
      causalEdge:cause.edge
    };
  }
}

export const organismGeometry = wholeGeometry;
