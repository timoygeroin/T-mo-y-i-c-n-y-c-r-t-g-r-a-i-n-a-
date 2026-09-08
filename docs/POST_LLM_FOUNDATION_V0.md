# Post-LLM Foundation v0

## Thesis

The primitive of the new system is **not a token, prompt, message, or model call**.

The primitive is a **cognitive transition**:

`state -> hypothesis -> predicted consequence -> action/observation -> evidence -> state revision`

Language is an optional interface into this process, not its substrate.

## Core object

A `CognitiveState` contains identity, goals, beliefs, episodic/semantic memory, world model, self model, attention, and immutable transition history.

## Runtime loop

1. Observe environment and internal state.
2. Select relevant state using attention.
3. Generate competing hypotheses.
4. Predict consequences.
5. Select an action/experiment.
6. Execute or simulate.
7. Compare prediction with observation.
8. Update beliefs and models.
9. Record provenance and causal lineage.
10. Repeated failure invalidates the causal line and requires a materially different model.

## Legacy stack replacement

| Legacy primitive | Post-LLM primitive |
|---|---|
| prompt | intent + constraints + success criteria |
| LLM API call | cognitive transition |
| agent | persistent cognitive organism |
| context window | dynamic attention field |
| RAG | provenance-aware living knowledge |
| vector DB | structured memory fabric |
| tool call | capability/action |
| chain-of-thought | hypotheses + predictions + evidence |
| fine-tuning | experience-driven learning |
| benchmark-only eval | continuous prediction/action verification |
| deployment | stateful organism instance |

## Non-negotiable invariants

1. No fabricated observation.
2. No claim of execution without evidence.
3. No irreversible mutation without authorization.
4. Failed causal models become counterexamples; they are not merely reworded.
5. State and provenance survive model replacement.
6. Mechanisms may evolve without silently changing identity invariants.
7. No single LLM is a required runtime dependency.

## Verification record

The first executable pass exposed a real defect: the runtime required transition history while the state schema did not define it. The state model was corrected to include persistent `history`. A reconstructed local execution of the four core tests then passed 4/4.

The GitHub status surface did not report a completed CI run for the latest head at the time of verification, so CI success is not claimed.

## v0 completion criterion

A minimal implementation must complete:

`goal -> hypothesis -> prediction -> action -> observation -> verification -> memory update -> next action`

and expose the complete transition record.

This is the first executable atom of the new class of system, not a claim that AGI has been achieved.
