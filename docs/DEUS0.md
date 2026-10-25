# DEUS-0 — bounded world simulator for MondayID

**Status:** deterministic, local, reversible simulation organ; not AGI, not omniscience, not real-world actuation.

## Why this is part of MondayID

`Worldline` is still the authority for state and causal provenance. `MondayRuntime` remains responsible for real effects and independently verified readback. DEUS-0 does not replace either. It enumerates *counterfactual branches* before any real-world execution, producing a hash-bound hypothetical report. The caller may explicitly append a simulation event to Worldline, but this is not promoted into a `fact`, `receipt`, `policy`, or `capability`.

## Lifecycle

`OBSERVATION -> MODEL ASSUMPTIONS -> CANDIDATE ACTIONS -> BOUNDED BRANCHING -> INVARIANT VETO -> RANK -> HYPOTHESIS RECEIPT -> REAL READBACK GATE`

Inputs are a constrained numeric model. For multiple possible interpretations, a separate trusted or model-assisted adapter can supply candidate models; **its assumptions remain unverified**. No LLM, billable API, filesystem, browser, network, or credentials are needed by DEUS-0.

## Integration

```js
import {simulateDeus0,recordDeus0Hypothesis} from './src/deus-zero.mjs';
const report = simulateDeus0({id:'study',initial:{x:0},goals:{x:{min:2}},actions:[{id:'probe',delta:{x:1},repeatable:true}],horizon:2});
// Optional: record as *hypothetical*, never as fact/verified action.
recordDeus0Hypothesis(existingMondayRuntime.worldline,report);
```

Run: `node src/deus-zero-demo.mjs`. Test: `node --test tests/deus-zero.test.mjs`.

## Non-goals, risks, gates

- This engine does not discover the true laws of physics, predict human behaviour, or guarantee simulated effects will occur.
- Branches are fully determined by supplied deltas and bounds. Missing side effects are not automatically detected.
- Hard constraints are checked after *every* transition. A branch that violates one is rejected, however attractive its goal score.
- `maxNodes` and `horizon` are strict compute budgets. `exhaustive:false` means search was truncated, not impossible.
- A digest makes accidental tampering detectable, **not authenticity**; there is no signature or external independent verification.
- Actual capability mutations and external actions must still pass MondayID's policy, authority and independent readback gates.
- For real user decisions add source provenance, calibrated uncertainty, multi-model counterexamples, explicit permissions, and field measurements before promotion.

## Acceptance example

The demo seeks continuity and evidence under time/money limits. A blind migration violates the time invariant. The best proposal uses provenance inspection, transfer test, and target-host verification. This is only a toy numerical benchmark, not proof of cross-host continuity.
