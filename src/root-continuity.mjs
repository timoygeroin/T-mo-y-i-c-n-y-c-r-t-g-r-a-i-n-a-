import crypto from 'node:crypto';

const stable = (value) => Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value);

const digest = value => crypto.createHash('sha256').update(stable(value)).digest('hex').slice(0, 24);

export const defaultRootInvariants = Object.freeze([
  'truth_requires_evidence',
  'effect_requires_readback',
  'identity_requires_provenance',
  'identity_requires_validated_lineage',
  'preventable_failure_must_become_detector'
]);

export class RootContinuityContract {
  constructor({
    rootId = 'mondayid:genesis',
    version = 1,
    invariants = defaultRootInvariants,
    parentProof = null
  } = {}) {
    if (!rootId) throw new Error('ROOT_ID_REQUIRED');
    this.rootId = String(rootId);
    this.version = Number(version) || 1;
    this.invariants = Object.freeze([...new Set(invariants.map(String))]);
    this.parentProof = parentProof ? structuredClone(parentProof) : null;
  }

  snapshot() {
    return {
      schema:'mondayid.root-continuity.v1',
      rootId:this.rootId,
      version:this.version,
      invariants:[...this.invariants],
      parentProof:this.parentProof ? structuredClone(this.parentProof) : null
    };
  }

  validateMutation({
    mutation = {},
    evidence = [],
    verification = null,
    parentState = null,
    nextState = null
  } = {}) {
    const architectural =
      mutation.scope === 'architecture' ||
      mutation.kind === 'kernel' ||
      mutation.architectural === true;

    if (!architectural) {
      return {
        ok:true,
        code:'ROOT_REVIEW_NOT_REQUIRED',
        rootId:this.rootId,
        contractVersion:this.version
      };
    }

    if (!Array.isArray(evidence) || evidence.length === 0) {
      return { ok:false, code:'ROOT_MUTATION_NO_EVIDENCE' };
    }
    if (verification?.ok !== true) {
      return { ok:false, code:'ROOT_MUTATION_UNVERIFIED' };
    }

    const conformanceOk =
      verification?.conformance === true ||
      verification?.conformance?.ok === true ||
      Boolean(verification?.regression);

    if (!conformanceOk) {
      return { ok:false, code:'ROOT_MUTATION_NO_CONFORMANCE_PROOF' };
    }

    if (mutation.rootId && mutation.rootId !== this.rootId) {
      return { ok:false, code:'ROOT_ID_MISMATCH', expected:this.rootId, got:mutation.rootId };
    }

    const removed = new Set((mutation.removesInvariants || []).map(String));
    const protectedRemoval = this.invariants.filter(item => removed.has(item));
    if (protectedRemoval.length > 0 && mutation.amendsRoot !== true) {
      return {
        ok:false,
        code:'ROOT_INVARIANT_REMOVAL_REQUIRES_AMENDMENT',
        invariants:protectedRemoval
      };
    }

    const proof = {
      schema:'mondayid.root-descendant-proof.v1',
      rootId:this.rootId,
      contractVersion:this.version,
      mutationId:mutation.id || null,
      parentDigest:parentState == null ? null : digest(parentState),
      nextDigest:nextState == null ? null : digest(nextState),
      evidence:[...evidence],
      conformance:structuredClone(verification.conformance ?? verification.regression ?? true)
    };
    proof.proofId = `root-proof:${digest(proof)}`;
    return { ok:true, code:'VALID_DESCENDANT', proof };
  }

  amend({ nextVersion, invariants, evidence = [], verification = null } = {}) {
    if (!Number.isInteger(nextVersion) || nextVersion <= this.version) {
      return { ok:false, code:'INVALID_ROOT_VERSION' };
    }
    if (!Array.isArray(invariants) || invariants.length === 0) {
      return { ok:false, code:'INVALID_ROOT_INVARIANTS' };
    }

    const validated = this.validateMutation({
      mutation:{
        id:`root-contract@${nextVersion}`,
        scope:'architecture',
        architectural:true,
        amendsRoot:true,
        rootId:this.rootId
      },
      evidence,
      verification,
      parentState:this.snapshot(),
      nextState:{ rootId:this.rootId, version:nextVersion, invariants }
    });
    if (!validated.ok) return validated;

    const contract = new RootContinuityContract({
      rootId:this.rootId,
      version:nextVersion,
      invariants,
      parentProof:validated.proof
    });
    return { ok:true, contract, proof:validated.proof };
  }
}
