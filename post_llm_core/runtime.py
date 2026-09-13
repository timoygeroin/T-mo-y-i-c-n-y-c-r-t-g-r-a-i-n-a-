from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from typing import Any, Callable, Iterable

from .types import Action, CognitiveState, Evidence, Hypothesis, Transition


class CognitiveRuntime:
    """Small LLM-independent executable atom of the post-LLM architecture."""

    def __init__(self, state: CognitiveState):
        self.state = state

    def _digest(self) -> str:
        payload = {
            "identity": self.state.identity,
            "goals": self.state.goals,
            "beliefs": self.state.beliefs,
            "memory": self.state.memory,
            "world_model": self.state.world_model,
            "self_model": self.state.self_model,
            "attention": self.state.attention,
        }
        encoded = json.dumps(payload, sort_keys=True, default=str).encode()
        return hashlib.sha256(encoded).hexdigest()

    def _viable_hypotheses(self, hypotheses: Iterable[Hypothesis]) -> list[Hypothesis]:
        invalidated = set(self.state.world_model.get("invalidated_causal_keys", []))
        return [hypothesis for hypothesis in hypotheses if hypothesis.causal_key not in invalidated]

    def transition(
        self,
        goal: str,
        hypotheses: Iterable[Hypothesis],
        chooser: Callable[[list[Hypothesis]], Hypothesis],
        actor: Callable[[Action], Any],
        action: Action,
        provenance: str = "runtime",
    ) -> Transition:
        """Run one complete hypothesis -> prediction -> action -> evidence cycle."""
        prior = self._digest()
        supplied = list(hypotheses)
        if not supplied:
            raise ValueError("A cognitive transition requires at least one hypothesis")

        candidates = self._viable_hypotheses(supplied)
        if not candidates:
            raise ValueError("No viable hypothesis remains; a new causal model is required")

        hypothesis = chooser(candidates)
        if hypothesis not in candidates:
            raise ValueError("Chooser returned a hypothesis outside the viable candidate set")

        observation = actor(action)
        evidence = Evidence(
            observation=observation,
            predicted=hypothesis.predicted_observation,
            supported=observation == hypothesis.predicted_observation,
            provenance=provenance,
        )

        self.state.beliefs[hypothesis.statement] = evidence.supported
        self.state.memory.append({
            "goal": goal,
            "hypothesis": asdict(hypothesis),
            "action": asdict(action),
            "evidence": asdict(evidence),
        })

        if not evidence.supported:
            # A failed prediction is a counterexample to the selected causal line.
            invalidated = self.state.world_model.setdefault("invalidated_causal_keys", [])
            if hypothesis.causal_key not in invalidated:
                invalidated.append(hypothesis.causal_key)

        self.state.history.append(
            Transition(
                goal=goal,
                hypothesis=hypothesis,
                action=action,
                evidence=evidence,
                prior_state_digest=prior,
                next_state_digest="",
            )
        )
        next_digest = self._digest()
        self.state.history[-1] = Transition(
            goal=goal,
            hypothesis=hypothesis,
            action=action,
            evidence=evidence,
            prior_state_digest=prior,
            next_state_digest=next_digest,
        )
        return self.state.history[-1]
