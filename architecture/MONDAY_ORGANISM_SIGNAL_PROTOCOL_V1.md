# Monday Organism: inter-cell communication protocol v1

Status: DESIGN / NOT DEPLOYED. Builds on existing organism-cell.mjs, worldline.mjs, effect-abi.mjs. Do not mistake same-process child cells for independently owned tenants: organism-cell.spawn currently shares worldline, policyField and actionLedger. Sharing that runtime across customer boundaries would violate isolation.

## Biology translated into engineering
- Cell membrane -> tenant boundary, scoped credentials, authenticated ingress and egress.
- DNA -> versioned protocol, testable contracts and signed update lineage, NOT one shared private memory.
- Synapse -> typed signal with causal parent, bounded TTL, delivery acknowledgement and inhibitory gate.
- Hormone -> broadcast policy/advisory updates with scoped audiences and expiry; never unbounded remote commands.
- Immune system -> anomaly detector, quarantined integration, revocation, audit and independent review.
- Metabolism -> per-instance resource budgets, cost metering, revenue attribution, no uncontrolled compute.
- Cancer failure mode -> self-amplifying signals, permission escalation, resource exhaustion and unreviewed replication; require hard quotas and a no-self-propagation invariant.
- Virus analogy -> portable signed skill package adopted voluntarily, never self-installing code or hidden exfiltration.

## Organism topology
Personal cell: local memory + local policy + user-owned data.
Organization cell: opt-in shared workspace with explicit roles; not a backdoor to employee personal accounts.
Regional relay: optional encrypted delivery, queue and rate limits; cannot infer content when E2EE.
Core governance: version registry, test corpus, safety signals, fleet health and signed releases.
Learning foundry: receives only explicitly allowed measurements or reviewed contributions, tests candidate improvements on synthetic tasks, promotes via independent evaluation.

## Signal envelope (schema monday.signal.v1)
Required: signalId, sourceTenant, destinationScope, kind, schemaVersion, issuedAt, expiresAt, causalParents[], capability, consentReference, payloadClassification, payloadDigest, signature.
Kinds: HELP_REQUEST, SKILL_PROPOSAL, QUALITY_METRIC, SECURITY_ALERT, POLICY_UPDATE, EFFECT_RECEIPT, ACK, REJECT.
Rules: verify signature, enrollment and recipient scope; reject expired, replayed, unauthorized, malformed, oversized and over-budget signals; classify and minimize payload; use end-to-end encryption for sensitive tenant-to-tenant content. Hash alone is not authentication. Every external effect goes through capability authorization and independent readback.

## Local learning -> global improvement
1. Local correction changes only that tenant's Worldline.
2. Local evaluator generates synthetic reproduction or non-content aggregate metrics.
3. Explicit consent gate determines whether a sanitized skill proposal can leave tenant.
4. Learning foundry checks leakage, provenance, tests, failure counterexamples and performance.
5. Independently verified improvements are packaged as signed versioned skills.
6. Canary rollout to opted-in test instances, then staged release with rollback and audit.
No raw private training by default; optional training consent is distinct from security telemetry and from incident-response access.

## Business organs
Sensing: customer pain points with consent, no unsolicited scraping.
Production: Monday Rescue bounded workflow delivery.
Sales: owner-approved outreach and transparent claims.
Finance: per-deployment margin and legal payment gates.
Support: reproducible incident receipts and customer-visible status.
Governance: owner can revoke compromised software and govern releases, but cannot silently decrypt tenant data.

## Implementation seams in existing repo
1. OrganismCell.spawn shares in-memory Worldline, policyField and actionLedger: safe for internal same-owner cells, NOT a multi-tenant customer fleet. Build an isolation adapter instead of using spawn as fleet enrollment.
2. Worldline offers event revisions, forks and reconciliation. Add tenant-scoped persistence and authenticated replication, with explicit consent on cross-tenant signal transport.
3. Effect ABI has budgets, privacy boundary, authorization and verification. Add real identity, signed messages, policy decision, tamper-resistant independent receipts and per-tenant quotas.
4. Test against two independently owned synthetic tenants before any public launch.

## First executable milestone / pass-fail
- Two isolated local processes or storage domains A and B.
- A and B exchange an allowlisted signed SKILL_PROPOSAL with synthetic payload and receive ACK.
- A attempts unauthorized read/write of B: rejected, B state unchanged.
- Tampered/replayed/expired/unsigned signals: rejected.
- No opt-in: learning message never leaves tenant.
- One independently verified local effect and one negative/no-op receipt.
- Revocation halts further network messages, while local Worldline remains accessible.
- Record measured resource cost and tests; no claims of a live organism before these tests pass.

## Economic rollout
One consented Monday Rescue tenant -> repeatable local installation -> customer-approved federated signals -> verified improvements -> optional paid fleet management. No spontaneous spread. No customer outreach, production deployment or spending without separate owner approval.
