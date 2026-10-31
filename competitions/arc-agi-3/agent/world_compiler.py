"""Effect-first causal world compiler for ARC-AGI-3.

This module intentionally does not claim paranormal telepathy or quantum
hardware.  "Shared latent" means a compact machine-readable belief field
shared by internal reasoning lanes.  "Stigmergy" means using observed
environment transitions as externalized memory.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
import math
from typing import Dict, Iterable, Mapping, MutableMapping, Sequence, Tuple


@dataclass(frozen=True)
class ProbeDecision:
    action: str
    information_gain: float
    reason: str
    vetoed_actions: Tuple[str, ...]


class SharedLatentField:
    """Confidence-weighted belief blackboard shared without prose messages."""

    def __init__(self) -> None:
        self._writes: list[tuple[str, dict[str, float], float]] = []

    def publish(
        self,
        source: str,
        beliefs: Mapping[str, float],
        *,
        confidence: float = 1.0,
    ) -> None:
        clean = {
            str(key): max(0.0, float(value))
            for key, value in beliefs.items()
            if math.isfinite(float(value)) and float(value) >= 0.0
        }
        if not clean:
            return
        total = sum(clean.values())
        if total <= 0.0:
            return
        normalized = {key: value / total for key, value in clean.items()}
        weight = max(0.0, min(1.0, float(confidence)))
        self._writes.append((str(source), normalized, weight))

    def read(self) -> dict[str, float]:
        if not self._writes:
            return {}
        accumulator: MutableMapping[str, float] = defaultdict(float)
        total_weight = 0.0
        for _source, beliefs, weight in self._writes:
            if weight <= 0.0:
                continue
            total_weight += weight
            for key, probability in beliefs.items():
                accumulator[key] += probability * weight
        if total_weight <= 0.0:
            return {}
        raw = {key: value / total_weight for key, value in accumulator.items()}
        norm = sum(raw.values())
        if norm <= 0.0:
            return {}
        return {key: value / norm for key, value in sorted(raw.items())}


class StigmergicMemory:
    """Causal transition memory where environment changes become memory traces."""

    def __init__(self) -> None:
        self._transitions: dict[tuple[str, str], str] = {}
        self._state_visits: Counter[str] = Counter()

    def observe(self, state: str, action: str, next_state: str) -> None:
        state = str(state)
        action = str(action)
        next_state = str(next_state)
        self._transitions[(state, action)] = next_state
        self._state_visits[state] += 1
        self._state_visits[next_state] += 1

    def predict(self, state: str, action: str) -> str | None:
        return self._transitions.get((str(state), str(action)))

    def replay(self, trace: Sequence[str]) -> str | None:
        if not trace:
            return None
        state = str(trace[0])
        for action in trace[1:]:
            state = self.predict(state, str(action))
            if state is None:
                return None
        return state

    def novelty(self, state: str) -> float:
        return 1.0 / (1.0 + self._state_visits[str(state)])


class WorldCompiler:
    """Maintain competing world hypotheses and choose discriminating probes."""

    def __init__(
        self,
        *,
        worlds: Iterable[str],
        predictions: Mapping[str, Mapping[str, str]],
        failure_genome: Mapping[str, Mapping[str, object]] | None = None,
        historical_success: Mapping[str, float] | None = None,
    ) -> None:
        self._worlds: tuple[str, ...] = tuple(map(str, worlds))
        self._predictions: dict[str, dict[str, str]] = {
            str(action): {str(world): str(outcome) for world, outcome in by_world.items()}
            for action, by_world in predictions.items()
        }
        self._failure_genome = {
            str(action): dict(entry)
            for action, entry in (failure_genome or {}).items()
        }
        self._historical_success = {
            str(action): float(value)
            for action, value in (historical_success or {}).items()
        }

    @property
    def worlds(self) -> tuple[str, ...]:
        return self._worlds

    @staticmethod
    def _entropy(counts: Counter[str]) -> float:
        total = sum(counts.values())
        if total <= 1:
            return 0.0
        entropy = 0.0
        for count in counts.values():
            if count <= 0:
                continue
            p = count / total
            entropy -= p * math.log2(p)
        return entropy

    def _information_gain(self, action: str) -> float:
        outcomes = Counter(
            self._predictions.get(action, {}).get(world, "__UNKNOWN__")
            for world in self._worlds
        )
        return self._entropy(outcomes)

    def _is_vetoed(self, action: str) -> bool:
        entry = self._failure_genome.get(action)
        if not entry:
            return False
        confidence = float(entry.get("confidence", 1.0) or 0.0)
        return confidence >= 0.95

    def choose_probe(self, actions: Sequence[str]) -> ProbeDecision:
        vetoed = tuple(str(action) for action in actions if self._is_vetoed(str(action)))
        candidates = [str(action) for action in actions if str(action) not in vetoed]
        if not candidates:
            raise RuntimeError("NO_ADMISSIBLE_PROBE")

        ranked = []
        for action in candidates:
            information_gain = self._information_gain(action)
            # Historical success is only a weak tie-breaker.  Discovery of the
            # world's rules outranks habitual success when success is uninformative.
            success = self._historical_success.get(action, 0.0)
            ranked.append((information_gain, success * 1e-6, action))
        information_gain, _tie, action = max(ranked)

        return ProbeDecision(
            action=action,
            information_gain=information_gain,
            reason="MAX_WORLD_DISCRIMINATION",
            vetoed_actions=vetoed,
        )

    def observe(self, action: str, observed_outcome: str) -> tuple[str, ...]:
        action = str(action)
        observed_outcome = str(observed_outcome)
        by_world = self._predictions.get(action, {})
        survivors = tuple(
            world
            for world in self._worlds
            if by_world.get(world, "__UNKNOWN__") == observed_outcome
        )
        self._worlds = survivors
        return survivors
