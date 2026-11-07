# Monday Fleet: privacy-preserving distribution and learning (v1)

Status: DESIGN COMMITTED, NOT DEPLOYED. Owner approval authorizes reversible development and testing; no permission to expose client data, publish a service, contact customers, or incur expenses.

## Principle
Each Monday instance is an independent tenant serving its user, with a common signed software lineage. Central governance controls only explicitly enrolled fleet software versions, security policy, opt-in telemetry, license status and revocable feature entitlements; it does not own the user's data, device, or decisions. User can export, disconnect, and delete local data.

## Four planes
1. **Personal data plane**: per-tenant encrypted event-sourced Worldline, preferences, goals, unfinished work, secrets in platform keychain, device-local cache. No raw conversations, files, contacts, embeddings, or customer records in fleet telemetry by default.
2. **Execution plane**: capability-scoped, least-privilege effectors with tenant-owned OAuth, explicit consent for actions, rate limits, rollback where feasible, external independent effect readback and receipts. No cross-tenant access.
3. **Fleet control plane**: enrolled instance ID (pseudonymous), signed update manifest, capability schema/version, policy version, health heartbeat, revocable enrollment, audit trail, kill-switch for compromised integrations, tenant-visible changelog. Owner/admin cannot silently read tenant memory or issue arbitrary customer actions.
4. **Learning plane**: local personalization by retrieval and user corrections, optionally local adapters if compute allows; opt-in privacy-filtered aggregate quality metrics; separately opt-in, reviewed sanitized examples; synthetic tasks and red-team tests by default. Federated learning/secure aggregation and differential privacy are future research features, NOT claimed present.

## Threat model and invariants
- Malicious tenant cannot read another tenant's state.
- Malicious fleet operator cannot read user plaintext by default; remote commands are limited to signed version/policy updates and narrowly defined revocations.
- Telemetry cannot include user prompts, emails, names, tokens, file paths or raw receipts; schema allowlist enforced before transmission.
- Encryption at rest/in transit, per-tenant keys, documented key recovery and deletion; no hard-coded global decrypt key.
- Model improvement never silently trains on personal data. Explicit revocable opt-in is separate from product use; retention and consent provenance recorded.
- Any shared gradient/adapter requires membership-inference and extraction testing, clipping, secure aggregation, differential privacy budget and governance before production.
- Customer can inspect which actions and telemetry occurred, export their data, revoke connectors, and leave.
- Emergency shutdown affects compromised fleet service or feature, not user's unrelated device or personal files.

## Protocol sketch
Enrollment: tenant creates local key -> registers pseudonymous instance and public key -> receives signed config and version policy -> tenant approves connectors -> local Worldline starts.
Execution: user intent -> capability check -> dry-run when possible -> effect -> independent readback -> tenant receipt -> optionally aggregate metric (no content).
Learning: local correction -> local memory update -> local quality evaluation -> (optional opt-in) bounded sanitized metrics -> aggregate analysis -> regression tests -> signed version candidate -> staged rollout -> monitored rollback.

## Distribution
First offer: Monday Rescue, a single narrow workflow with an auditable result, deployed for one consenting tenant. Packaging paths: customer-run local instance, customer-controlled cloud, or managed multi-tenant service only after security/legal review. No self-propagation, unapproved installations, or hidden agents. Expansion requires explicit adoption per customer.

## MVP acceptance tests (must pass before any sale or public release)
A. Two tenants with identical-looking records cannot cross-read, cross-write, or cross-trigger actions.
B. Disable telemetry and prove zero outbound learning payloads.
C. Opt-in sends allowlisted metrics only; deliberately seeded PII/secrets rejected before egress.
D. Revocation stops future updates/metrics and token access; no loss of local user data.
E. Tampered update signature rejected; prior version remains operational.
F. Effect receipts are independently verified, including negative/no-op test.
G. Export and deletion tested, with honest caveat about external processor retention.
H. Upgrade and rollback preserve personal Worldline causality.

## Existing asset reuse
Reuse MondayID Worldline/event sourcing, Effect ABI, trusted effectors, independent effect reader, local-first Surface 02 and private DEUS simulation. Verify actual code and coverage before declaring integration complete. No new clone framework until gaps are mapped.

## Release gates
1. Inspect current code and tests; create gap matrix.
2. Implement tenant boundaries and telemetry allowlist in isolated branch.
3. Add automated negative tests and threat-model review.
4. Local synthetic two-tenant demo, no customer data.
5. Owner approval for public deployment, outreach, paid service and legally binding terms; confirm applicable Israeli business/tax and privacy requirements.

## Economics
Zero-owner-spend prototype; measure per-tenant hosting/model/API cost and delivery hours before quoting. Proposed 490 ILS Monday Rescue is a price hypothesis, not a confirmed market price. Recurring license only after reliable real-world results.

## Monday Guardian: incident-response access policy (design amendment)
- Company owner is a governance role, NOT a universal decryption key. Customer data access is not granted solely by ownership or curiosity.
- Tier 0 routine: instance health, versions, action types and aggregate metrics; no personal content by default.
- Tier 1 anomaly: alert on suspicious permission escalation, export bursts, unusual effector usage; metadata minimized, thresholds tested for false positives.
- Tier 2 investigation: specific incident ticket, lawful basis and customer notice/consent when required, purpose and time limits, minimal scope, independent dual approval, audited access and post-incident review. For business tenants, administrator rights must be expressly disclosed and contractually scoped.
- Tier 3 emergency: revoke credentials, quarantine a connector, suspend a dangerous action or service; emergency access to content only where legally permitted and technically provisioned, never a blanket silent backdoor. Every break-glass action logged, independently reviewed, and time-limited.
- Data collection and retention: transparent tenant settings, separate consent for model training, deletion/export, access transparency report, regional/legal review before deployment. Incident security processing is not equivalent to training consent.
- Cryptographic constraint: if data is end-to-end encrypted solely under customer-held keys, operator cannot read plaintext without customer-assisted access. Any optional recovery/escrow changes this property and must be explicit, opt-in and separately secured.
- Abuse handling focuses on observable system behavior, not speculative employee intentions. Never silently surveil staff, bypass tenant permissions, or train on private conversations by default.
- Acceptance tests: owner account compromise cannot decrypt tenant content; emergency revoke works without content access; unauthorized break-glass is denied; approved access creates immutable audit trail; consent withdrawal stops future training data flow.
