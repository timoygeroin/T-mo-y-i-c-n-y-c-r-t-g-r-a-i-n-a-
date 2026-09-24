# CELL_DELTA — consumer Activity truth states

Effect: expose the product-contract Activity states as real local task states instead of a hard-coded Running placeholder.

Mutation parent: `187441d761dc472db61bd1605931f6b255819958`.

Observed source readback:
- `MondayTaskState` includes `Running`, `Waiting`, `Needs you`, `Completed`, `Failed`, `Changed`.
- task rows can transition to Running / Waiting / Changed / Failed from the context menu.
- Activity renders real task collections for Running / Waiting / Needs you / Completed / Changed / Failed.
- existing Recent changes remains a separate event log.

Routing lesson: unauthenticated browser write and brittle source-shape transforms are routing signals, not blockers; authenticated GitHub + one-shot CI mutation completed the change and removed its temporary workflow/helper.

Verification requirement: this file intentionally touches `platform/apple-host/**` so the normal Monday iOS Runtime Wire Proof compiles the exact current head containing the mutation; Monday Product Contract must also remain green. Do not promote the Consumer shell gate solely from this delta because capture/media and any other unsatisfied shell acceptance remain open.
