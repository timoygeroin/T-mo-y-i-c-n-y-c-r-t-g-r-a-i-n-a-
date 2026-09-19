# MondayID Convergence Controller

This directory is the anti-fragmentation boundary for MondayID.

## Why it exists

Three years of work repeatedly reached the same correct conclusions without reliably changing the whole system. The failure was not lack of ideas or code. It was **state authority fragmentation**: chats, branches, automations and product experiments could each become locally correct while the user still experienced no single delivered Monday.

The controller therefore makes one distinction executable:

**CHAT != STATE AUTHORITY**

A chat is a compute cell. It may recover state, act, test, and propose a mutation. It cannot silently become the organism's canonical state.

## Coordination authority

The coordination lock is **not the repository's main commit SHA**.

A state file cannot safely require `main == a SHA stored inside that same commit`: merging the state file itself advances main and creates a false split-brain signal.

MondayID therefore uses compare-and-swap over two values read together:

1. canonical `state_id` from `MONDAYID_SYSTEM_STATE.json`;
2. the GitHub blob SHA returned when that exact state file was read.

The pair is the semantic coordination head.

Repository `main` remains code provenance and a rebase baseline. If main moves while the canonical state file is unchanged, a worker may need a code rebase, but its semantic CELL_DELTA is **not stale merely because main moved**.

## Simultaneous-chat model

Every active chat follows:

`READ STATE + BLOB SHA -> LOCK BOTH -> DO WORK -> PRODUCE CELL_DELTA -> READBACK STATE + BLOB -> PROMOTE OR REBASE`

If two chats start from the same state/blob pair, the first accepted state mutation changes the canonical file and therefore its blob SHA/state_id. The second worker then fails CAS and must rebase or quarantine. It can never silently overwrite newer organism state.

This is optimistic concurrency for cognition using the state artifact itself as the CAS object.

## One canonical report

Whole-system reports must be compiled from:

1. `MONDAYID_SYSTEM_STATE.json` and its current blob SHA;
2. live GitHub/provider readback for referenced code/deployments;
3. verified receipts.

Chat recollection alone is never sufficient for a system status report.

## Architecture freeze

While `release_status = CONVERGING`, a delta of kind `NEW_ARCHITECTURE` is rejected.

Existing product lines must be repaired, ported, merged, or explicitly quarantined before a new competing host/runtime/vision architecture is admitted.

## Delivery gate

A green CI run, branch, PR, source file, test, or automation is **work evidence**, not delivery.

MondayID becomes `DELIVERED_VERIFIED` only when every user-visible delivery criterion in the canonical state has a true readback.

The governing laws are:

- BUILD != DELIVERED
- OUTPUT != SUCCESS
- CHAT != ORGANISM
- CELL_DELTA_ONLY
- ONE CANONICAL STATE ARTIFACT
- REPOSITORY HEAD != STATE AUTHORITY
- STATE_ID + STATE BLOB SHA = COORDINATION CAS
- USER_VISIBLE_EFFECT_IS_THE_RELEASE_GATE

## 2026-09-19 correction

PR #53 successfully put convergence on main. The first live transport attempts then exposed a flaw in v1: PR #56 quarantined a valid semantic delta simply because the merge of #53 had advanced main while the state artifact itself had not changed.

v2 treats that as a code-rebase concern, not semantic staleness.

## Current convergence target

Repair the failed live-model transport port from PR #55 on current main, using state CAS rather than main-SHA equality, then obtain real provider and user-visible production readback.
