const normalize = (value) => String(value ?? '').trim();

const hasProvenance = (value) => {
  if (typeof value === 'string') return normalize(value).length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
};

export function capabilityContract(action, available = {}) {
  const primitives = Object.entries(available)
    .filter(([, receptor]) => receptor && typeof receptor.execute === 'function')
    .map(([domain, receptor]) => ({
      domain,
      name: receptor.name || domain,
      canVerify: typeof receptor.verify === 'function',
      exposes: Array.isArray(receptor.exposes) ? receptor.exposes : []
    }));

  return {
    schema: 'mondayid.capability-contract.v1',
    id: `capability:${action.domain}:${action.objectiveId}`,
    domain: action.domain,
    desiredEffect: normalize(action.effect),
    inputs: ['objective', 'current-worldline', 'available-primitives'],
    outputs: ['effect-result', 'verification-receipt'],
    invariants: [
      'do_not_claim_capability_before_proof',
      'recover_proven_compute_before_new_compute',
      'reuse_merge_patch_new_with_provenance',
      'prefer_composition_before_new_dependency',
      'preserve_worldline_revision',
      'verify_effect_not_invocation'
    ],
    availablePrimitives: primitives,
    acceptance: {
      executable: true,
      verificationRequired: true,
      evidenceRequired: true,
      provenanceRequiredForReuse: true
    },
    instruction: `Recover a proven reusable organ first. Only if no compatible proof-carrying organ exists, build the smallest residual organ that can cause and verify this effect: ${normalize(action.effect)}`
  };
}

function reusableRecoveredOrgan(recovered, action) {
  if (!recovered?.receptor || typeof recovered.receptor.execute !== 'function') {
    return { ok:false, code:'RECOVERED_ORGAN_INVALID' };
  }
  if (typeof recovered.receptor.verify !== 'function') {
    return { ok:false, code:'RECOVERED_ORGAN_NO_VERIFIER' };
  }
  if (recovered.proof?.ok !== true) {
    return { ok:false, code:'RECOVERED_ORGAN_UNPROVEN' };
  }
  if (!hasProvenance(recovered.provenance)) {
    return { ok:false, code:'RECOVERED_ORGAN_NO_PROVENANCE' };
  }
  if (typeof recovered.receptor.supports === 'function') {
    try {
      if (recovered.receptor.supports(action) !== true) {
        return { ok:false, code:'RECOVERED_ORGAN_INCOMPATIBLE' };
      }
    } catch {
      return { ok:false, code:'RECOVERED_ORGAN_INCOMPATIBLE' };
    }
  }
  return { ok:true, code:null };
}

export class CapabilityFoundry {
  constructor({ builder = null, recover = null } = {}) {
    this.builder = builder;
    this.recover = recover;
  }

  propose(action, available = {}) {
    return {
      state: 'PROPOSED',
      action,
      contract: capabilityContract(action, available)
    };
  }

  async recoverProven(proposal, available = {}) {
    if (typeof this.recover !== 'function') return { attempted:false, candidate:null };

    try {
      const candidate = await this.recover(proposal.contract, available, proposal.action);
      if (!candidate) return { attempted:true, candidate:null, ok:false, code:'NO_RECOVERED_ORGAN' };

      const verdict = reusableRecoveredOrgan(candidate, proposal.action);
      if (!verdict.ok) {
        return { attempted:true, candidate, ok:false, code:verdict.code };
      }

      return { attempted:true, candidate, ok:true, code:null };
    } catch (error) {
      return {
        attempted:true,
        candidate:null,
        ok:false,
        code:'RECOVERY_ERROR',
        error:String(error)
      };
    }
  }

  async forge(action, available = {}) {
    const proposal = this.propose(action, available);
    const recovery = await this.recoverProven(proposal, available);

    if (recovery.ok === true) {
      const recovered = recovery.candidate;
      return {
        ...proposal,
        ok: true,
        state: 'REUSED',
        receptor: recovered.receptor,
        proof: recovered.proof,
        provenance: recovered.provenance,
        receipt: {
          capabilityId: proposal.contract.id,
          domain: proposal.contract.domain,
          mode: 'REUSED',
          builder: recovered.builder || 'recovered-proven-organ',
          provenance: recovered.provenance,
          proof: recovered.proof
        }
      };
    }

    if (typeof this.builder !== 'function') {
      return {
        ...proposal,
        ok: false,
        code: 'NO_BUILDER',
        recovery: {
          attempted: recovery.attempted,
          code: recovery.code || null
        }
      };
    }

    const built = await this.builder(proposal.contract, available, {
      recovery: {
        attempted: recovery.attempted,
        code: recovery.code || null
      }
    });
    if (!built?.receptor || typeof built.receptor.execute !== 'function') {
      return {
        ...proposal,
        ok: false,
        code: 'INVALID_ORGAN',
        built: built ?? null,
        recovery: { attempted:recovery.attempted, code:recovery.code || null }
      };
    }

    const proof = built.proof ?? (
      typeof built.receptor.selfTest === 'function'
        ? await built.receptor.selfTest(proposal.contract)
        : null
    );

    if (proof?.ok !== true) {
      return {
        ...proposal,
        ok: false,
        code: 'UNPROVEN_ORGAN',
        built,
        proof: proof ?? null,
        recovery: { attempted:recovery.attempted, code:recovery.code || null }
      };
    }

    return {
      ...proposal,
      ok: true,
      state: 'PROVEN',
      receptor: built.receptor,
      proof,
      provenance: built.provenance || null,
      recovery: { attempted:recovery.attempted, code:recovery.code || null },
      receipt: {
        capabilityId: proposal.contract.id,
        domain: proposal.contract.domain,
        mode: recovery.attempted ? 'PATCH_OR_NEW_AFTER_RECOVERY' : 'BUILT',
        builder: built.builder || 'anonymous',
        provenance: built.provenance || null,
        proof
      }
    };
  }
}
