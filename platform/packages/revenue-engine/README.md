# MondayID Revenue Engine

This package turns raw opportunities into source-ranked, authority-gated revenue decisions.

It is intentionally narrower than a generic sales agent. It only routes work MondayID can honestly execute and preserves four hard human authority gates:

- platform login
- spending money
- final contract acceptance
- payment operations

## Initial offers

- `mondayid_ai_workflow_pilot`: AI, LLM, agents, Base44, automation, and integration delivery.
- `mondayid_memory_forge`: conversion of scattered conversation archives into a portable memory and continuity package for an LLM.
- `mondayid_research_sprint`: bounded research, writing, and translation work used as a cash-flow lane rather than the core product.

## Decision routes

- `draft_proposal`: strong fit; generate a tailored proposal, plan, price, and proof packet.
- `shortlist_for_review`: potentially viable, but missing scope or fit evidence.
- `human_gate`: all reversible work may continue, but execution stops at a named authority boundary.
- `reject`: unsupported, underpriced, dishonest, or operationally invalid.

## Proof

Run:

```bash
npm --workspace @mondayid/revenue-engine run proof:examples
```

The proof includes a qualified Base44 pilot, a login/contract-gated lead, and a lead that requests fabricated credentials.
