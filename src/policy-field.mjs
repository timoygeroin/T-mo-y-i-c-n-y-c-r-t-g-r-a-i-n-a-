import crypto from 'node:crypto';

const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 20);

export class PolicyField {
  constructor({ metaInvariants = [], policies = [] } = {}) {
    this.metaInvariants = Object.freeze([...new Set(metaInvariants)]);
    this.policies = new Map();
    this.history = [];
    for (const policy of policies) this.policies.set(policy.id, { ...policy });
  }

  snapshot() {
    return {
      metaInvariants: [...this.metaInvariants],
      policies: [...this.policies.values()].map(x => ({ ...x })),
      history: this.history.map(x => ({ ...x }))
    };
  }

  mutate({ id, statement, scope = 'organism', evidence = [], verification = null, supersedes = null } = {}) {
    if (!id || !statement) return { ok:false, code:'INVALID_POLICY_MUTATION' };
    if (this.metaInvariants.includes(id)) return { ok:false, code:'META_INVARIANT_IMMUTABLE' };
    if (!Array.isArray(evidence) || evidence.length === 0) return { ok:false, code:'NO_EVIDENCE' };
    if (verification?.ok !== true) return { ok:false, code:'UNVERIFIED_MUTATION' };

    const prior = this.policies.get(id) || null;
    const generation = (prior?.generation || 0) + 1;
    const policy = {
      id,
      statement,
      scope,
      generation,
      status:'active',
      evidence:[...evidence],
      supersedes:supersedes || (prior ? `${id}@${prior.generation}` : null)
    };
    const receipt = {
      id:`policy-receipt:${digest({ policy, verification })}`,
      policyId:id,
      generation,
      verification
    };

    if (prior) {
      this.history.push({ ...prior, status:'superseded', supersededBy:`${id}@${generation}` });
    }
    this.policies.set(id, policy);
    this.history.push({ ...policy, receiptId:receipt.id });
    return { ok:true, policy:{...policy}, receipt };
  }
}

export const defaultMetaInvariants = Object.freeze([
  'truth_requires_evidence',
  'effect_requires_readback',
  'identity_requires_provenance',
  'preventable_failure_must_become_detector'
]);
