# MondayID Continuity Kernel

## Shared recovery before model calls

`createRecoveryService({ authorize, readCheckpoint })` exposes an account-scoped
`recover` operation for Chat and Work clients. It verifies access before reading,
returns the same boot packet for both surfaces, and caches by account,
checkpoint fingerprint, policy version, and source manifest hash. Recovery
never calls a model or advances a revision. A new verified checkpoint
invalidates the old cache entry; `applyContinuityDelta` continues to reject
stale parent fingerprints.

The host must provide an authenticated account identifier, an account-partitioned
private checkpoint store, and the currently measured source manifest hash.
This module neither changes ChatGPT's ordinary Chat UI nor grants automatic
access to other conversations. Run `npm run proof:recover` to check reuse,
account isolation, invalidation, and stale-delta behavior.

This package moves continuity authority out of any single ChatGPT branch.

A chat is a temporary terminal. The checkpoint is the state authority.

## What the kernel preserves

- one active track
- one active result invariant
- acceptance tests and unresolved remainder
- source-ranked laws and artifacts
- explicit distinction between present bytes, referenced-only artifacts, missing artifacts, and superseded versions
- deterministic checkpoint fingerprints
- append-only lineage through parent fingerprints
- a compact boot packet for the next host session

## What it rejects

- model-summary-only restoration
- fake claims that missing files are present
- stale deltas overwriting a newer checkpoint
- `DONE` while unresolved remainder exists
- an active target without acceptance tests
- continuity declarations without direct or repository-backed authority

## Core flow

```text
RAW CHATS + LIBRARY ARTIFACTS + REPOSITORY STATE + CURRENT DIRECTIVE
  -> source ranking
  -> normalized artifact registry
  -> active target and acceptance tests
  -> deterministic checkpoint fingerprint
  -> boot packet
  -> one external act or exact blocker
  -> append-only delta
  -> next checkpoint
```

## Proof

Run:

```bash
npm --workspace @mondayid/continuity-kernel run proof:examples
```

The proof verifies:

1. a partial checkpoint can boot honestly while old ZIP bytes remain referenced-only;
2. model-summary-only restoration is blocked;
3. a stale delta cannot overwrite live state;
4. a valid delta advances the fingerprint and preserves lineage.

## Boundary

This package does not claim that every historical chat has already been read or that every old artifact byte is available. It provides the mechanism that prevents those missing layers from being silently upgraded into fake memory.
