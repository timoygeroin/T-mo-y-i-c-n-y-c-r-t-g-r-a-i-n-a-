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
  'identity_requires_validated_lineage',
  'preventable_failure_must_become_detector'
]);


const leasePayload = lease => JSON.stringify({
  id:lease.id,
  cellId:lease.cellId,
  domain:lease.domain,
  effect:lease.effect,
  issuedAt:lease.issuedAt,
  expiresAt:lease.expiresAt,
  nonce:lease.nonce
});

export function createAuthorityMembrane({
  rootKey,
  now = () => Date.now(),
  randomBytes = size => crypto.randomBytes(size)
} = {}) {
  if (!rootKey) throw new Error('AUTHORITY_ROOT_KEY_REQUIRED');
  const consumed = new Set();

  const sign = lease => crypto
    .createHmac('sha256', String(rootKey))
    .update(leasePayload(lease))
    .digest('hex');

  const validSignature = lease => {
    if (!lease?.signature) return false;
    const expected=Buffer.from(sign(lease),'hex');
    const actual=Buffer.from(String(lease.signature),'hex');
    return expected.length===actual.length && crypto.timingSafeEqual(expected,actual);
  };

  const authorize = ({ lease, cellId, domain, effect } = {}) => {
    if (!lease || !validSignature(lease)) return {ok:false,code:'LEASE_INVALID'};
    if (consumed.has(lease.id)) return {ok:false,code:'LEASE_ALREADY_CONSUMED'};
    if (Number(now()) > Number(lease.expiresAt)) return {ok:false,code:'LEASE_EXPIRED'};
    if (
      String(cellId||'') !== lease.cellId ||
      String(domain||'') !== lease.domain ||
      String(effect||'') !== lease.effect
    ) return {ok:false,code:'LEASE_SCOPE_MISMATCH'};
    return {
      ok:true,
      leaseId:lease.id,
      expiresAt:lease.expiresAt,
      authority:'BOUNDED_EPHEMERAL_LEASE'
    };
  };

  return Object.freeze({
    schema:'mondayid.authority-membrane.v1',
    issue({cellId,domain,effect,ttlMs=60_000} = {}) {
      if (!cellId || !domain || !effect) return {ok:false,code:'LEASE_SCOPE_REQUIRED'};
      const ttl=Math.max(1,Math.min(Number(ttlMs)||0,5*60_000));
      const issuedAt=Number(now());
      const nonce=randomBytes(16).toString('hex');
      const unsigned={
        id:`lease:${crypto.createHash('sha256').update([cellId,domain,effect,issuedAt,nonce].join('|')).digest('hex').slice(0,24)}`,
        cellId:String(cellId),
        domain:String(domain),
        effect:String(effect),
        issuedAt,
        expiresAt:issuedAt+ttl,
        nonce
      };
      const lease=Object.freeze({...unsigned,signature:sign(unsigned)});
      return {ok:true,lease};
    },
    authorize,
    consume(input={}) {
      const auth=authorize(input);
      if (!auth.ok) return auth;
      consumed.add(input.lease.id);
      return {...auth,consumed:true};
    }
  });
}
