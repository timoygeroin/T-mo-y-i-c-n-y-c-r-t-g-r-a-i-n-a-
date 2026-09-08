# Post-LLM Foundation v0

## Thesis

The primitive of the new system is **not a token, prompt, message, or model call**.

The primitive is a **cognitive transition**:

`state -> hypothesis -> predicted consequence -> action/observation -> evidence -> state revision`

Language is an optional interface into this process, not its substrate.

## Core object

A `CognitiveState` contains:

- identity: persistent system identity and invariants
- goals: desired state transitions
- beliefs: propositions with provenance and confidence
- memory: episodic and semantic traces
- world_model: entities, relations, causal hypotheses, predictions
- self_model: capabilities, limits, current resources
- attention: the subset of state selected for the current transition
- history: immutable transition records

## Runtime loop

1. Observe current environment and internal state.
2. Select what matters using attention, not a fixed context window.
3. Generate competing hypotheses.
4. Predict consequences for each hypothesis.
5. Select an action/experiment that maximizes information or goal progress under constraints.
6. Execute or simulate the action.
7. Compare prediction with observation.
8. Update beliefs, memory, world model, and self-model.
9. Record provenance and causal lineage.
10. If a failure repeats on the same causal line, invalidate the causal model and generate a materially different one.

## Replacements for the legacy AI stack

| Legacy primitive | Post-LLM primitive |
|---|---|
| prompt | intent + constraints + success criteria |
| LLM API call | cognitive transition |
| agent | persistent cognitive organism |
| context window | dynamic attention field |
| RAG | provenance-aware living knowledge |
| vector DB | structured memory fabric |
| tool call | capability/action |
| chain-of-thought | explicit hypotheses + predictions + evidence |
| fine-tuning | experience-driven learning |
| benchmark-only eval | continuous prediction/action verification |
| deployment | stateful organism instance |

## Non-negotiable invariants

1. No fabricated observation.
2. No claim of execution without evidence.
3. No irreversible mutation without authorization.
4. Failed causal models become counterexamples; they are not merely reworded.
5. State and provenance survive individual model replacement.
6. The system may improve its mechanisms without changing its identity invariants.
7. Language models may be used as specialist organs, but the runtime must not depend on any single LLM.

## v0 success criterion

A minimal implementation is successful only if it can complete a full closed loop without an LLM:

`goal -> hypothesis -> prediction -> action -> observation -> verification -> memory update -> next action`

and expose the complete transition record for inspection.

This is the first executable atom of the new class of system.
