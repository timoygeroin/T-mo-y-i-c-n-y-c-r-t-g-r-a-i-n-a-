# Post-LLM Foundation v0

The first machine is defined around cognitive transitions rather than prompts or model calls.

`state -> hypothesis -> prediction -> action -> observation -> evidence -> state revision`

## Included substrate

- persistent identity, goals, beliefs and transition history
- episodic/semantic memory traces with provenance and salience
- dynamic attention selection
- explicit world-model storage
- hypothesis selection that excludes invalidated causal lines
- evidence records connecting predictions to observations
- state digests for transition continuity
- an LLM-independent runtime

## Legacy stack replacement

| Legacy | Post-LLM |
|---|---|
| prompt | intent + constraints + success criteria |
| LLM API call | cognitive transition |
| agent | persistent cognitive organism |
| context window | attention field |
| RAG | provenance-aware knowledge |
| vector DB | memory fabric |
| tool call | capability/action |
| chain-of-thought | hypotheses + predictions + evidence |
| fine-tuning | experience-driven learning |
| benchmark-only eval | continuous prediction/action verification |
| deployment | stateful organism instance |

## Verification

The first execution attempt exposed a genuine state-schema defect: the runtime required `history`, but `CognitiveState` did not define it. The causal implementation was corrected by adding persistent transition history. A reconstructed local execution then passed all four core tests.

GitHub did not report a completed CI run for the current head during this pass. Therefore CI success is not claimed.

## Boundary

This milestone is a working foundation, not AGI. The next engineering layers are world-model learning, action planning, self-modeling, architecture evolution, multimodal perception, scalable training, and capability evaluation against strong contemporary systems.
