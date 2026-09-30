from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from .types import CognitiveState, Hypothesis


@dataclass(frozen=True)
class MemoryTrace:
    kind: str
    key: str
    value: Any
    provenance: str
    salience: float = 1.0


class CognitiveSubstrate:
    """Deterministic substrate services; no language model is required."""

    def __init__(self, state: CognitiveState):
        self.state = state

    def remember(self, trace: MemoryTrace) -> None:
        self.state.memory.append({
            "kind": trace.kind,
            "key": trace.key,
            "value": trace.value,
            "provenance": trace.provenance,
            "salience": trace.salience,
        })

    def recall(self, key: str, limit: int = 8) -> list[dict[str, Any]]:
        matches = [m for m in reversed(self.state.memory) if m.get("key") == key]
        return matches[:limit]

    def focus(self, candidates: Iterable[str], limit: int = 8) -> tuple[str, ...]:
        """Select a bounded attention field without pretending it is a context window."""
        scored: list[tuple[float, str]] = []
        goal_text = " ".join(self.state.goals).lower()
        for item in candidates:
            score = 0.0
            lowered = item.lower()
            for token in goal_text.split():
                if token and token in lowered:
                    score += 1.0
            for memory in self.state.memory[-32:]:
                if str(memory.get("key", "")).lower() in lowered:
                    score += float(memory.get("salience", 0.0))
            scored.append((score, item))
        scored.sort(key=lambda pair: (-pair[0], pair[1]))
        self.state.attention = tuple(item for _, item in scored[:limit])
        return self.state.attention

    def rank_hypotheses(self, hypotheses: Iterable[Hypothesis]) -> list[Hypothesis]:
        """Prefer novel, non-invalidated causal lines; deterministic tie-break by statement."""
        invalid = set(self.state.world_model.get("invalidated_causal_keys", []))
        ranked = [h for h in hypotheses if h.causal_key not in invalid]
        ranked.sort(key=lambda h: (h.causal_key in invalid, h.statement))
        return ranked

    def next_hypothesis(self, hypotheses: Iterable[Hypothesis]) -> Hypothesis:
        ranked = self.rank_hypotheses(hypotheses)
        if not ranked:
            raise ValueError("No viable hypothesis remains; a new causal model is required")
        return ranked[0]
