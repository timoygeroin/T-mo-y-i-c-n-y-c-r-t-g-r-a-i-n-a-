from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Tuple


@dataclass(frozen=True)
class Hypothesis:
    statement: str
    predicted_observation: Any
    causal_key: str


@dataclass(frozen=True)
class Action:
    name: str
    payload: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Evidence:
    observation: Any
    predicted: Any
    supported: bool
    provenance: str


@dataclass(frozen=True)
class Transition:
    goal: str
    hypothesis: Hypothesis
    action: Action
    evidence: Evidence
    prior_state_digest: str
    next_state_digest: str


@dataclass
class CognitiveState:
    identity: str
    goals: list[str] = field(default_factory=list)
    beliefs: dict[str, Any] = field(default_factory=dict)
    memory: list[Mapping[str, Any]] = field(default_factory=list)
    world_model: dict[str, Any] = field(default_factory=dict)
    self_model: dict[str, Any] = field(default_factory=dict)
    attention: Tuple[str, ...] = ()
    history: list[Transition] = field(default_factory=list)
