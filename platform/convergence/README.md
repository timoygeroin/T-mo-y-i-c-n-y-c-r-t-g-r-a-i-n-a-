# MondayID Convergence Controller

This directory is the anti-fragmentation boundary for MondayID.

## Why it exists

Three years of work repeatedly reached the same correct conclusions without reliably changing the whole system. The failure was not lack of ideas or code. It was **state authority fragmentation**: chats, branches, automations and product experiments could each become locally correct while the user still experienced no single delivered Monday.

The controller therefore makes one distinction executable:

**CHAT != STATE AUTHORITY**

A chat is a compute cell. It may recover state, act, test, and propose a mutation. It cannot silently become the organism's canonical state.

## Simultaneous-chat model

Every active chat follows:

`READ CANONICAL STATE -> LOCK PARENT STATE_ID -> DO WORK -> PRODUCE CELL_DELTA -> READBACK -> PROMOTE OR REBASE`

If two chats work at once, both may start from the same parent. The first accepted delta advances the canonical `state_id`. The second is now stale and must be rebased against the new state. It is never allowed to overwrite the newer organism merely because it finished later.

This is optimistic concurrency for cognition.

## One canonical report

Whole-system reports must be compiled from:

1. `MONDAYID_SYSTEM_STATE.json`;
2. live GitHub/provider readback for the referenced heads;
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
- ONE_CANONICAL_HEAD
- USER_VISIBLE_EFFECT_IS_THE_RELEASE_GATE

## Current convergence target

The current first move is not another design exercise. It is to port/rebase the already-tested PR #46 live model transport onto current main, then obtain real production readback before opening another product architecture line.
