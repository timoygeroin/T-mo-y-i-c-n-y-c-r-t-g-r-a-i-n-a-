# MondayID / MondayOS: zero-capital execution charter

Date: 2026-11-08
Status: working-branch charter; not a deployment, customer commitment, or proof of commercial readiness.

## Owner mandate
Build on the EXISTING MondayID, MondayOS, Monday Work, Surface, iPhone Continuum, runtime, proof and memory assets. Aim for a commercially viable AI company without new out-of-pocket owner spend. Technical research, reversible development, sandbox experiments, testing, branch work and free-tier preparation are authorized. Separate explicit approval is required for spending, public launches, third-party outreach, legal obligations, IP transfer, and irreversible operations. Never claim independent operation beyond actual scheduled jobs or active sessions.

## Product hypothesis
A narrow evidence-first agent execution/proof product derived from existing MondayID components. This is a hypothesis, not verified product-market fit. Avoid duplicating existing components or naming a new organism.

## Decision gates
1. Inventory existing apps, endpoints, repositories, deployments, contracts, tests and asset provenance. Label verified, stale, inaccessible, or unverified. Do not infer production status from a PR.
2. Choose one existing product surface and one end-to-end user job. Specify input, real effect, independent readback, failure behavior, data retention and zero-spend constraints.
3. Implement the smallest missing integration in this branch with regression tests and negative controls. No false-positive success receipts.
4. Run tests and independent readback. A passing unit test alone is not production acceptance.
5. Produce private demo and cost model, with ROI = (verified attributable revenue - verified costs)/verified costs only when costs > 0; when costs = 0, ROI is undefined, and report revenue/cost separately. No invented revenue.
6. Seek explicit owner approval before public release, contacting prospects, billing activation or contractual commitment.

## Current evidence
- Canonical README describes recursive cells, event-sourced Worldline, causal lineage, host receptors and verification.
- PR #217 describes goal-to-chat collapse repair; PR #219 describes effect-bound orders; PR #221 describes trusted effectors. Their existence does not establish merge or deployment.
- Earlier Surface, Monday Work, iPhone, CapabilityFoundry and DEUS-0 work appears in repository PR history; actual current runtime acceptance remains to be checked.

## Release conditions
A real user-visible job must run end-to-end; independently observed effect matches claim; permissions and costs are controlled; repeatability, failure behavior and rollback are demonstrated. Until then: CANDIDATE, NOT SHIPPED.
