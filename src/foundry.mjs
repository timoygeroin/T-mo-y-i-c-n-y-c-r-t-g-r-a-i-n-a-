const normalize = (value) => String(value ?? '').trim();

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
      'prefer_composition_before_new_dependency',
      'preserve_worldline_revision',
      'verify_effect_not_invocation'
    ],
    availablePrimitives: primitives,
    acceptance: {
      executable: true,
      verificationRequired: true,
      evidenceRequired: true
    },
    instruction: `Build the smallest reusable organ that can cause and verify this effect: ${normalize(action.effect)}`
  };
}

export class CapabilityFoundry {
  constructor({ builder = null } = {}) {
    this.builder = builder;
  }

  propose(action, available = {}) {
    return {
      state: 'PROPOSED',
      action,
      contract: capabilityContract(action, available)
    };
  }

  async forge(action, available = {}) {
    const proposal = this.propose(action, available);
    if (typeof this.builder !== 'function') {
      return { ...proposal, ok: false, code: 'NO_BUILDER' };
    }

    const built = await this.builder(proposal.contract, available);
    if (!built?.receptor || typeof built.receptor.execute !== 'function') {
      return { ...proposal, ok: false, code: 'INVALID_ORGAN', built: built ?? null };
    }

    const proof = built.proof ?? (
      typeof built.receptor.selfTest === 'function'
        ? await built.receptor.selfTest(proposal.contract)
        : null
    );

    if (proof?.ok !== true) {
      return { ...proposal, ok: false, code: 'UNPROVEN_ORGAN', built, proof: proof ?? null };
    }

    return {
      ...proposal,
      ok: true,
      state: 'PROVEN',
      receptor: built.receptor,
      proof,
      receipt: {
        capabilityId: proposal.contract.id,
        domain: proposal.contract.domain,
        builder: built.builder || 'anonymous',
        proof
      }
    };
  }
}
