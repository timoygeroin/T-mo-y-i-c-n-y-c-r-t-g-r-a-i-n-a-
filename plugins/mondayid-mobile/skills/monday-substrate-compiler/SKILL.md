---
name: monday-substrate-compiler
description: Reinterpret external connectors, plugins, skills, runtimes, agent products, and compute services as provider-independent MondayID capabilities. Use when removing server/provider dependence, designing local-first or hybrid execution, deciding what to clone/reimplement, or turning an external tool pattern into a Monday-owned organ.
---

# MONDAY_SUBSTRATE_COMPILER

The goal is not to collect more vendors. The goal is to discover useful primitives, compile them into MondayID, and keep providers replaceable.

## Core distinction
MondayID may use infrastructure without being infrastructure-dependent. "No server" means no dedicated always-on Monday server is required for identity, continuity, or authority. Third-party models and services may still run remotely; they are burst compute, receptors, or tools, not the organism.

## Capability extraction
For every external connector, plugin, skill, app, or service that looks useful, derive a provider-independent capability gene:
- intent/trigger
- input and output schema
- permission boundary
- state requirements
- side effects
- verifier/readback
- failure and rollback behavior
- latency/cost profile
- portability constraints
- provenance/source

Then classify the result:
- REUSE: Monday already has the effect.
- MERGE: combine complementary implementations behind one organ contract.
- PATCH: preserve the organ but add missing verification, continuity, local authority, or iPhone behavior.
- NEW: implement a Monday-owned capability only when a residual gap remains.
- RETIRE: remove duplicated provider-specific paths after verified replacement.

## Reimplementation boundary
Do not extract or copy proprietary closed-source internals. Equivalent behavior may be independently reimplemented from public documentation, exposed schemas, documented APIs, user-owned source, open-source code with compatible licensing, or clean-room design.

## Three-plane substrate
Design every critical capability so it can map onto these planes:

### 1. Local authority plane
The iPhone owns user identity, high-risk permissions, local policy, admission of durable state, minimal continuity seed, local sensors, and deterministic actions when possible. Use local/on-device models for bounded inference when the platform exposes them.

### 2. Portable continuity plane
C*, provenance, immutable or append-only receipts, rollback anchors, capability registry, and compact revival seed must be exportable and reconstructable. Replication is allowed; provider capture is not.

### 3. Opportunistic compute plane
Use any available model, GPU job, browser agent, hosted builder, or cloud runtime as temporary compute. Compute cells should be selected dynamically and be replaceable without changing Monday's identity.

## Synthetic hardware
Until dedicated physical hardware exists, treat the combined execution fabric as Monday's synthetic hardware:
- secure phone primitives
- local inference/runtime
- browser/web receptors
- host-native tools
- connected apps
- cloud jobs only when useful
- storage replicas and receipts

The abstraction boundary must make the future replacement of this synthetic hardware with custom hardware possible without rewriting Monday's cognitive laws.

## Connector mining loop
When surveying installed or discoverable connectors:
1. Ignore marketing names initially.
2. Inspect actual callable actions or skill contracts.
3. Identify the primitive each one proves can exist.
4. Compare with Monday's capability registry.
5. Compile only net-new primitives or stronger verifiers.
6. Prefer the narrowest owned implementation that removes lock-in.
7. Preserve a fallback route until the replacement passes conformance tests.
8. MERGE -> VERIFY -> KILL OLD.

## High-value primitive families
Prioritize primitives that strengthen the organism rather than decorate it:
- local/on-device inference
- durable portable memory/graphs
- action orchestration and scheduling
- browser/computer manipulation
- app/code generation with source ownership
- sandbox/build/test/deploy loops
- identity/auth/permissions
- event streams and notifications
- annotation/pointing interfaces
- speech/vision receptors
- deterministic computation
- evaluation, observability, and rollback

## Decision test
Before adding a dependency ask:
"If this provider disappeared tonight, would Monday lose identity, memory, authority, or only one temporary capability?"

Identity/memory/authority loss is an architecture failure. Temporary capability loss is acceptable if another receptor can be attached later.
