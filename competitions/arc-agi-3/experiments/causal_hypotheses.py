"""Bounded, offline counterfactual *research* module for ARC-AGI-3.

Fits concrete no-op, translation and one-color-change world hypotheses
against observed object transitions. A proposed probe requires an EXACT
same-level witnessed A -> B -> A reversal; this is evidence of a past
reversal, not a guarantee that a future action is safe or optimal.

Not imported by the competition agent; policy integration requires a
matched-budget public-game A/B and regression gate.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

# Each object: (color, area, min_x, min_y, max_x, max_y).
Scene = tuple[tuple[int, int, int, int, int, int], ...]


@dataclass(frozen=True)
class Transition:
    action: str
    before: Scene
    after: Scene
    level_before: int = 0
    level_after: int = 0


@dataclass(frozen=True)
class Model:
    kind: str
    dx: int = 0
    dy: int = 0
    from_color: int = -1
    to_color: int = -1


@dataclass(frozen=True)
class FittedHypothesis:
    model: Model
    likelihood: float
    matches: int
    observations: int


@dataclass(frozen=True)
class ProbeChoice:
    action: str
    reversal_action: str
    disagreement: float
    predictions: tuple[Scene, ...]
    evidence_count: int


def predict(model: Model, scene: Scene) -> Scene | None:
    if model.kind == 'static':
        return scene
    output = []
    for color, area, x0, y0, x1, y1 in scene:
        if model.kind == 'translate':
            x0 += model.dx; x1 += model.dx
            y0 += model.dy; y1 += model.dy
        elif model.kind == 'recolor':
            if color == model.from_color:
                color = model.to_color
        else:
            return None
        if not (0 <= x0 <= x1 < 64 and 0 <= y0 <= y1 < 64):
            return None
        output.append((color, area, x0, y0, x1, y1))
    return tuple(sorted(output))


def _candidate_models(before: Scene, after: Scene) -> set[Model]:
    models: set[Model] = set()
    if not before or len(before) != len(after):
        return models
    # Enumerate translations from a real observed object pair, and verify
    # the WHOLE predicted scene instead of inferring from a single pixel.
    for a in before[:1]:
        for b in after:
            if a[:2] != b[:2]:
                continue
            model = Model('translate', dx=b[2]-a[2], dy=b[3]-a[3])
            if (model.dx or model.dy) and predict(model, before) == after:
                models.add(model)
    # Recolor one observed color consistently; never assume palette semantics.
    for a in before:
        for b in after:
            if a[1:] == b[1:] and a[0] != b[0]:
                model = Model('recolor', from_color=a[0], to_color=b[0])
                if predict(model, before) == after:
                    models.add(model)
    return models


def fit_hypotheses(examples: Iterable[Transition], action: str,
                   max_models: int = 8) -> tuple[FittedHypothesis, ...]:
    data = [e for e in examples if e.action == action and
            e.level_before == e.level_after]
    if not data:
        return ()
    models = {Model('static')}
    for e in data:
        models.update(_candidate_models(e.before, e.after))
    fitted = []
    for model in models:
        matches = sum(predict(model, e.before) == e.after for e in data)
        if model.kind != 'static' and matches == 0:
            continue
        # Laplace likelihood is a bounded ranking weight, not a calibrated
        # posterior probability of a game's hidden rules.
        likelihood = (matches + 1) / (len(data) + 2)
        fitted.append(FittedHypothesis(model, likelihood, matches, len(data)))
    return tuple(sorted(fitted, key=lambda h: (-h.likelihood, h.model.kind,
            h.model.dx, h.model.dy, h.model.from_color, h.model.to_color))[:max_models])


def _reversal_witness(scene: Scene, action: str,
                      data: list[Transition], level: int) -> str | None:
    # A known return path is a *necessary* research gate, not a universal
    # guarantee of reversibility. Avoid claiming safe future execution.
    for e in data:
        if e.action != action or e.before != scene or e.level_before != level or e.level_after != level or e.after == scene:
            continue
        for reverse in data:
            if (reverse.before == e.after and reverse.after == scene and
                    reverse.level_before == level and reverse.level_after == level):
                return reverse.action
    return None


def choose_probe(scene: Scene, legal_actions: Iterable[str],
                 examples: Iterable[Transition], level: int = 0,
                 max_examples: int = 64) -> ProbeChoice | None:
    """Return a witnessed probe with disagreeing *predicted scenes*.

    Does not execute actions, inspect hidden state or alter agent policy.
    """
    if max_examples <= 0:
        return None
    data = list(examples)[-min(max_examples, 256):]
    same_level = [e for e in data if e.level_before == level and e.level_after == level]
    best: ProbeChoice | None = None
    for action in sorted(set(legal_actions)):
        reverse = _reversal_witness(scene, action, same_level, level)
        if reverse is None:
            continue
        fitted = fit_hypotheses(same_level, action)
        predictions = [(predict(h.model, scene), h.likelihood) for h in fitted]
        predictions = [(s, weight) for s, weight in predictions if s is not None]
        if len(set(s for s, _ in predictions)) < 2:
            continue
        total = sum(weight for _, weight in predictions)
        if total <= 0:
            continue
        # This is outcome disagreement among concrete predicted worlds,
        # not an action-count entropy or a proxy for game progress.
        disagreement = sum(2 * wi * wj for i, (si, wi) in enumerate(predictions)
                           for sj, wj in predictions[i+1:] if si != sj) / (total * total)
        distinct = tuple(sorted(set(s for s, _ in predictions)))
        choice = ProbeChoice(action, reverse, disagreement, distinct, len(data))
        if best is None or (choice.disagreement, choice.action) > (best.disagreement, best.action):
            best = choice
    return best
