# MondayID Computer Bootstrap

This directory is the bootstrap control surface for the owned MondayID computer contract.

A request in `computer/requests/*.json` is not treated as completed because a process exited successfully. The Generation-5 computer receptor executes the bounded workspace request and then performs a distinct readback request against explicit acceptance criteria. Only that independent readback can emit a `VERIFIED` receipt.

GitHub Actions is an external bootstrap substrate, not MondayID identity and not a permanent architectural dependency. The owned pieces are the task contract, executor/receptor semantics, verification law, receipts, compute continuity and causal recovery. The substrate is replaceable.

Request schema:

- `schema = mondayid.computer-task.v1`
- stable `id`
- desired `effect`
- `executionRequest`
- distinct `verificationRequest`
- explicit `acceptance`

The bootstrap workflow persists receipts under `computer/receipts/`. A failed or unsupported request fails closed and does not produce a verified claim.
