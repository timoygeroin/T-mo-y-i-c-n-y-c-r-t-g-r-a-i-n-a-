"""Conservative prequential one-object effect predictions on public ARC traces.

Research-only: no import by the submission agent. Each outcome is scored
BEFORE it is learned. Rules are action-specific, episode-local, and only
transfer between distinct object positions with unambiguous shape identity.
Static, exact-scene/action replay and effect forecasts share identical turns.
No inferred reversibility, gameplay gain, or Kaggle score.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import json
from pathlib import Path
import sys

from effect_coverage_audit import SCHEMA, _scene, classify


def _signature(obj):
    color, area, x0, y0, x1, y1 = obj
    return (color, area, x1 - x0, y1 - y0)


def _effect_forecast(before, action, evidence):
    counts = Counter(_signature(obj) for obj in before)
    candidates = []
    ambiguous = False
    for obj in before:
        signature = _signature(obj)
        rules = evidence.get((action, signature), set())
        if len(rules) > 1:
            ambiguous = True
        if counts[signature] != 1 or len(rules) != 1:
            continue
        dx, dy = next(iter(rules))
        if not (dx or dy):
            continue
        c, area, x0, y0, x1, y1 = obj
        shifted = (c, area, x0 + dx, y0 + dy, x1 + dx, y1 + dy)
        if not (0 <= shifted[2] <= shifted[4] < 64 and
                0 <= shifted[3] <= shifted[5] < 64):
            continue
        if shifted in before:
            continue
        candidates.append((obj, shifted))
    # A unique causal effect is required; never choose between multiple
    # possible movers by arbitrary order or by the current outcome.
    if len(candidates) != 1:
        return None, ambiguous or len(candidates) > 1
    old, new = candidates[0]
    prediction = list(before)
    prediction.remove(old)
    prediction.append(new)
    return tuple(sorted(prediction)), ambiguous


def _learn_effect(before, after, action, evidence):
    kind = classify([list(x) for x in before], [list(x) for x in after])
    if kind not in ('static', 'single_object_translate'):
        return
    counts = Counter(_signature(obj) for obj in before)
    removed = list((Counter(before) - Counter(after)).elements())
    added = list((Counter(after) - Counter(before)).elements())
    moved = None
    if kind == 'single_object_translate' and len(removed) == len(added) == 1:
        old, new = removed[0], added[0]
        if _signature(old) == _signature(new) and counts[_signature(old)] == 1:
            moved = (old, (new[2] - old[2], new[3] - old[3]))
    for obj in before:
        signature = _signature(obj)
        if counts[signature] != 1:
            continue
        # A no-op witness for the same signature/action conflicts with
        # a movement witness. This intentionally favors abstention.
        if moved is not None and obj == moved[0]:
            evidence[(action, signature)].add(moved[1])
        elif obj in after:
            evidence[(action, signature)].add((0, 0))


def evaluate(records, max_records=4096):
    if type(max_records) is not int or not 1 <= max_records <= 100000:
        raise ValueError('invalid max_records')
    seen = {}
    evidence = defaultdict(set)
    current_game = None
    current_level = None
    last_turn = -1
    stats = dict(records=0, same_level_records=0, reset_records=0,
                 level_advance_records=0, static_correct=0,
                 replay_correct=0, replay_used=0,
                 effect_correct=0, effect_nonstatic=0,
                 effect_nonstatic_correct=0, effect_unseen=0,
                 effect_unseen_correct=0, ambiguous_effect_abstentions=0,
                 combined_correct=0, combined_replay_used=0,
                 combined_effect_used=0, combined_nonstatic=0,
                 combined_nonstatic_correct=0)
    for index, row in enumerate(records):
        if index >= max_records:
            raise ValueError('record limit exceeded')
        if not isinstance(row, dict) or row.get('schema') != SCHEMA:
            raise ValueError('invalid trace schema')
        game, turn, action = row.get('game_id'), row.get('turn'), row.get('action_key')
        legal = row.get('legal_actions')
        lb, la = row.get('level_before'), row.get('level_after')
        if (not isinstance(game, str) or not game or type(turn) is not int or turn < 0 or
                not isinstance(action, str) or not action or len(action) > 128 or
                not isinstance(legal, list) or any(not isinstance(v, str) for v in legal) or
                type(lb) is not int or type(la) is not int or min(lb, la) < 0):
            raise ValueError('invalid trace metadata')
        base_action = action.split('@', 1)[0]
        if action != 'RESET' and (base_action not in legal or
                (base_action == 'ACTION6' and '@' not in action)):
            raise ValueError('illegal action or missing click coordinates')
        before, after = _scene(row.get('before_scene')), _scene(row.get('after_scene'))
        stats['records'] += 1
        if game != current_game or lb != current_level or turn != last_turn + 1:
            seen = {}
            evidence = defaultdict(set)
        current_game, current_level, last_turn = game, lb, turn
        if action == 'RESET':
            stats['reset_records'] += 1
            seen = {}
            evidence = defaultdict(set)
            continue
        if lb != la:
            stats['level_advance_records'] += 1
            seen = {}
            evidence = defaultdict(set)
            current_level = la
            continue
        stats['same_level_records'] += 1
        key = (action, before)
        prior = seen.get(key)
        replay = next(iter(prior)) if prior is not None and len(prior) == 1 else before
        effect, ambiguous = _effect_forecast(before, action, evidence)
        effect_prediction = effect if effect is not None else before
        stats['static_correct'] += int(before == after)
        stats['replay_correct'] += int(replay == after)
        stats['replay_used'] += int(prior is not None and len(prior) == 1)
        stats['effect_correct'] += int(effect_prediction == after)
        stats['effect_nonstatic'] += int(effect is not None)
        stats['effect_nonstatic_correct'] += int(effect is not None and effect == after)
        stats['effect_unseen'] += int(effect is not None and prior is None)
        stats['effect_unseen_correct'] += int(effect is not None and prior is None and effect == after)
        stats['ambiguous_effect_abstentions'] += int(ambiguous and effect is None)
        if prior is not None and len(prior) == 1:
            combined = replay
            stats['combined_replay_used'] += 1
        elif prior is not None:
            combined = before  # contradictory exact evidence vetoes transfer
        elif effect is not None:
            combined = effect
            stats['combined_effect_used'] += 1
        else:
            combined = before
        stats['combined_correct'] += int(combined == after)
        stats['combined_nonstatic'] += int(combined != before)
        stats['combined_nonstatic_correct'] += int(combined != before and combined == after)
        # Update only AFTER all matched forecasts were scored.
        seen.setdefault(key, set()).add(after)
        _learn_effect(before, after, action, evidence)
    return {**stats, 'effect_on_agent': 'NONE_SHADOW_ONLY',
            'claim': 'prequential_one_object_effect_vs_matched_static_and_replay_not_kaggle_score'}


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: single_object_prequential.py PUBLIC_TRANSITIONS.jsonl')
    with Path(sys.argv[1]).open(encoding='utf-8') as handle:
        print(json.dumps(evaluate(json.loads(line) for line in handle if line.strip()), sort_keys=True))


if __name__ == '__main__':
    main()
