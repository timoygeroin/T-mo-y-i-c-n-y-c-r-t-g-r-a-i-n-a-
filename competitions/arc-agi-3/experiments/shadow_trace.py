"""Prequential, offline shadow-only audit of ARC public-game object transitions.

Predict BEFORE observing each transition outcome. Never import this module
into the submission agent or treat a diagnostic score as Kaggle performance.
ACTION6 is keyed by exact click coordinates; no cross-game/level transfer.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Iterable

from causal_hypotheses import Transition, choose_probe, fit_hypotheses, predict

SCHEMA = 'arc-agi3.shadow-transition.v1'


def _scene(raw: object) -> tuple[tuple[int, int, int, int, int, int], ...]:
    if not isinstance(raw, list):
        raise ValueError('scene must be a list')
    result = []
    for item in raw:
        if not isinstance(item, list) or len(item) != 6 or any(type(v) is not int for v in item):
            raise ValueError('object descriptor must contain six integers')
        color, area, x0, y0, x1, y1 = item
        if not (0 <= color <= 255 and 1 <= area <= 4096 and
                0 <= x0 <= x1 < 64 and 0 <= y0 <= y1 < 64):
            raise ValueError('invalid object descriptor bounds')
        result.append(tuple(item))
    return tuple(sorted(result))


def evaluate(records: Iterable[dict], max_history: int = 64) -> dict:
    """Measure one-step predictions on same-game, same-level prior evidence.

    This is a chronological diagnostic, NOT held-out game generalization.
    No game actions are selected or executed by this evaluator.
    """
    if not 1 <= max_history <= 256:
        raise ValueError('max_history must be 1..256')
    history: list[Transition] = []
    current_game: str | None = None
    last_turn = -1
    stats = dict(records=0, same_level_records=0, evaluated=0,
                 exact_correct=0, static_correct=0,
                 non_static_predictions=0, probe_candidates=0)
    for row in records:
        if not isinstance(row, dict) or row.get('schema') != SCHEMA:
            raise ValueError('invalid trace schema')
        game = row.get('game_id')
        turn = row.get('turn')
        action = row.get('action_key')
        legal = row.get('legal_actions')
        if (not isinstance(game, str) or not game or
                type(turn) is not int or turn < 0 or
                not isinstance(action, str) or not action or
                not isinstance(legal, list) or any(not isinstance(a, str) for a in legal)):
            raise ValueError('invalid game, turn, action, or legal actions')
        base_action = action.split('@', 1)[0]
        if base_action not in legal or (base_action == 'ACTION6' and '@' not in action):
            raise ValueError('action not legal or click missing coordinates')
        before = _scene(row.get('before_scene'))
        after = _scene(row.get('after_scene'))
        lb = row.get('level_before')
        la = row.get('level_after')
        if type(lb) is not int or type(la) is not int or min(lb, la) < 0:
            raise ValueError('invalid levels')
        if game != current_game or turn <= last_turn:
            history = []
            current_game = game
        last_turn = turn
        stats['records'] += 1
        if lb != la:
            history = []  # never infer within-level physics across a level transition
            continue
        stats['same_level_records'] += 1
        prior = [e for e in history if e.level_before == lb and e.level_after == lb]
        fitted = fit_hypotheses(prior, action)
        if fitted:
            prediction = predict(fitted[0].model, before)
            if prediction is not None:
                stats['evaluated'] += 1
                stats['exact_correct'] += int(prediction == after)
                stats['static_correct'] += int(before == after)
                stats['non_static_predictions'] += int(fitted[0].model.kind != 'static')
        probe = choose_probe(before, legal, prior, level=lb, max_examples=max_history)
        stats['probe_candidates'] += int(probe is not None)
        history.append(Transition(action, before, after, lb, la))
        history = history[-max_history:]
    return {**stats, 'effect_on_agent': 'NONE_SHADOW_ONLY',
            'score_type': 'prequential_object_scene_diagnostic_not_kaggle_score'}


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit('Usage: shadow_trace.py PUBLIC_TRANSITIONS.jsonl')
    path = Path(sys.argv[1])
    with path.open(encoding='utf-8') as handle:
        result = evaluate(json.loads(line) for line in handle if line.strip())
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main()
