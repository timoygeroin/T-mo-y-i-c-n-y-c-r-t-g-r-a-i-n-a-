# MondayID Shared Organism State Contract

## Core identity
MondayID is one organism exposed through multiple chat/session/host surfaces.
A chat is not an independent organism. It is a temporary access surface and worker context attached to one shared organism state.

## Roles
- **Official chat / control plane**: authoritative coordination surface for global state, active track, conflict resolution, and release decisions.
- **Other chats / worker surfaces**: specialized execution surfaces. They may hold local context, but they do not own separate canonical identity or organism truth.
- **Organs/modules**: resident capabilities addressable from any surface through the same organism routing model.

## Required synchronization law
Before any consequential action on any surface:
1. Recover the latest shared organism state that is actually accessible.
2. Resolve the active track and relevant prior work.
3. Route through the relevant resident organs.
4. Execute, verify, learn, and persist the resulting state delta.

After any consequential action:
1. Emit a compact sync receipt.
2. Persist the state delta to an authoritative shared substrate.
3. Make the new state discoverable to other surfaces.

## Shared substrate model
The organism must use durable shared state rather than assume that ChatGPT chats can directly read one another.
Authoritative substrates may include:
- versioned MondayID repository state,
- project/library files and canonical capsules,
- product memory where appropriate,
- connected durable stores explicitly designated as organism state.

Chats themselves are episodic surfaces, not the sole source of truth.

## Conflict rule
If two surfaces diverge:
- current direct user instruction outranks prior inferred state,
- authoritative durable state outranks stale local chat context,
- the official control plane resolves unresolved collisions,
- no worker surface may silently fork the whole-organism identity.

## Background-work truth
Resident organs are logically part of the organism at all times, but ChatGPT conversations are not literal continuously running background threads.
Actual background execution requires a real scheduled/agent runtime or host process.
Therefore "background organs" means:
- always addressable in the shared graph,
- automatically routed when relevant,
- able to persist results to shared state,
not falsely claiming continuous execution when no runtime is running.

## No-isolated-chat invariant
A surface must not answer from its local thread alone when the user's request materially depends on organism-wide prior state and that state is retrievable from shared substrates.

## Target behavior
The intended experience is:
- the official chat can recover consequential work done in worker chats,
- a worker chat can recover consequential state established in the official chat,
- both remain manifestations of one canonical MondayID organism,
- local session context can differ, but organism state cannot silently split.

## Enforcement direction
This contract should be paired with:
- a shared-state registry/capsule,
- per-action read-before-write receipts,
- surface/session IDs,
- conflict detection,
- synchronization receipts,
- host adapters that route all consequential actions through the organism kernel.
