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
import random
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


@dataclass(frozen=True)
class FossilGene:
    name: str
    disposition: str
    exposed_worlds: int = 0
    total_worlds: int = 0
    successes: int = 0
    regressions: int = 0
    failure_modes: Tuple[str, ...] = ()

    @property
    def generalization_weight(self) -> float:
        if self.disposition == "INHERIT":
            return 1.0
        if self.total_worlds <= 0:
            return 0.0
        exposure = max(0.0, min(1.0, self.exposed_worlds / self.total_worlds))
        evidence_balance = (self.successes + 1.0) / (
            self.successes + self.regressions + 2.0
        )
        return exposure * evidence_balance


class AgentFossilGenome:
    """Old-agent behavior converted into scoped inheritance rather than dogma."""

    def __init__(self, genes: Iterable[FossilGene]) -> None:
        self._genes = {gene.name: gene for gene in genes}

    def gene(self, name: str) -> FossilGene:
        return self._genes[str(name)]

    def prior_for_action(
        self,
        action: str,
        action_map: Mapping[str, str] | None = None,
    ) -> float:
        gene_name = (action_map or {}).get(str(action))
        if not gene_name or gene_name not in self._genes:
            return 0.0
        return self._genes[gene_name].generalization_weight

    @classmethod
    def from_novelty_agent_retrospective(cls) -> "AgentFossilGenome":
        # Inherited structural reflexes come from the frozen agent itself.
        # CLICK_STAGNATION_GATE is deliberately scoped by the retrospective:
        # 3/25 public trajectories were exposed, with one faster, one slower,
        # and one still failing to reach the first level.
        return cls((
            FossilGene(
                name="LEGAL_ACTION_DISCIPLINE",
                disposition="INHERIT",
                failure_modes=(),
            ),
            FossilGene(
                name="COORDINATE_CLICK_IDENTITY",
                disposition="INHERIT",
                failure_modes=(),
            ),
            FossilGene(
                name="TRANSITION_REPLAY",
                disposition="INHERIT",
                failure_modes=(),
            ),
            FossilGene(
                name="LOOP_AVOIDANCE",
                disposition="INHERIT",
                failure_modes=(),
            ),
            FossilGene(
                name="CLICK_STAGNATION_GATE",
                disposition="SCOPED_ONLY",
                exposed_worlds=3,
                total_worlds=25,
                successes=1,
                regressions=1,
                failure_modes=("mixed_regression", "low_exposure"),
            ),
        ))


class WorldCompiler:
    """Maintain competing world hypotheses and choose discriminating probes."""

    def __init__(
        self,
        *,
        worlds: Iterable[str],
        predictions: Mapping[str, Mapping[str, str]],
        failure_genome: Mapping[str, Mapping[str, object]] | None = None,
        historical_success: Mapping[str, float] | None = None,
        fossil_genome: AgentFossilGenome | None = None,
        fossil_action_map: Mapping[str, str] | None = None,
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
        self._fossil_genome = fossil_genome
        self._fossil_action_map = {
            str(action): str(gene)
            for action, gene in (fossil_action_map or {}).items()
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
            fossil_prior = (
                self._fossil_genome.prior_for_action(action, self._fossil_action_map)
                if self._fossil_genome is not None else 0.0
            )
            # Fossil knowledge is a prior only.  It can break a true tie, but it
            # cannot overpower stronger world discrimination.
            ranked.append((information_gain, fossil_prior * 1e-6, success * 1e-9, action))
        information_gain, _fossil_tie, _success_tie, action = max(ranked)

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



def run_synthetic_ecology(seed: int = 0, episodes_per_family: int = 40) -> dict[str, float | int]:
    """Compare effect-first discovery with a habit baseline on hidden-rule toys.

    This is a mechanism regression test, not an ARC score estimate.  Each family
    has four latent worlds.  A diagnostic probe reveals which world is active;
    exploiting without discovery is a three-guess habit with a hard episode cap.
    """
    if episodes_per_family <= 0:
        raise ValueError("episodes_per_family must be positive")

    rng = random.Random(seed)
    families = (
        "color_rule",
        "symmetry_rule",
        "causal_gate",
        "sequence_rule",
    )
    total_episodes = len(families) * episodes_per_family
    effect_actions = 0
    habit_actions = 0
    effect_successes = 0
    habit_successes = 0
    family_results = []

    for family_index, family in enumerate(families):
        worlds = tuple(f"{family}:W{i}" for i in range(4))
        probe = f"{family}:PROBE"
        exploits = tuple(f"{family}:GOAL{i}" for i in range(4))
        predictions = {
            probe: {world: f"OBS{i}" for i, world in enumerate(worlds)}
        }
        for action_index, action in enumerate(exploits):
            predictions[action] = {
                world: ("WIN" if world_index == action_index else "FAIL")
                for world_index, world in enumerate(worlds)
            }

        family_effect_actions = 0
        family_habit_actions = 0
        family_effect_successes = 0
        family_habit_successes = 0
        offset = rng.randrange(4)

        for episode in range(episodes_per_family):
            target_index = (episode + offset) % 4
            target_world = worlds[target_index]

            compiler = WorldCompiler(
                worlds=worlds,
                predictions=predictions,
                fossil_genome=AgentFossilGenome.from_novelty_agent_retrospective(),
            )
            first = compiler.choose_probe((probe, *exploits))
            if first.action != probe:
                raise AssertionError("effect-first controller failed to choose diagnostic probe")
            observed = predictions[probe][target_world]
            survivors = compiler.observe(probe, observed)
            family_effect_actions += 1
            if survivors == (target_world,):
                # Once the latent world is identified, compile the world-specific
                # action instead of continuing undirected novelty search.
                goal = exploits[target_index]
                family_effect_actions += 1
                if predictions[goal][target_world] == "WIN":
                    family_effect_successes += 1

            # Habit baseline: replay a fixed historically preferred ordering.
            # It does not get the diagnostic observation and has at most 3 tries.
            won = False
            for action in exploits[:3]:
                family_habit_actions += 1
                if predictions[action][target_world] == "WIN":
                    family_habit_successes += 1
                    won = True
                    break
            if not won:
                pass

        effect_actions += family_effect_actions
        habit_actions += family_habit_actions
        effect_successes += family_effect_successes
        habit_successes += family_habit_successes
        effect_rate = family_effect_successes / episodes_per_family
        habit_rate = family_habit_successes / episodes_per_family
        effect_mean = family_effect_actions / episodes_per_family
        habit_mean = family_habit_actions / episodes_per_family
        family_results.append(
            effect_rate > habit_rate and effect_mean < habit_mean
        )

    return {
        "families": len(families),
        "episodes": total_episodes,
        "effect_first_mean_actions": effect_actions / total_episodes,
        "habit_mean_actions": habit_actions / total_episodes,
        "effect_first_success_rate": effect_successes / total_episodes,
        "habit_success_rate": habit_successes / total_episodes,
        "families_won": sum(bool(x) for x in family_results),
    }
