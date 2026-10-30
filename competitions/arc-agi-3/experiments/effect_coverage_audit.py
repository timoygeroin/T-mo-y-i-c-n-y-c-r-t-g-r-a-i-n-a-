"""Read-only ARC public-trace audit of concrete action-effect expressibility.

Post-hoc effect classes are an ORACLE UPPER BOUND, not predictive evidence.
A separate exact-scene/action replay predicts before seeing the outcome,
using only earlier transitions from the same contiguous game/level episode.
No contest agent import, no policy change, no Kaggle evaluation.
"""
from __future__ import annotations

from collections import Counter
import json
from pathlib import Path
import sys

SCHEMA = 'arc-agi3.shadow-transition.v1'
CLASSES = ('static', 'global_translate', 'global_recolor',
           'single_object_translate', 'single_object_recolor',
           'object_count_change', 'unexplained')


def _scene(raw):
    if not isinstance(raw, list):
        raise ValueError('scene must be a list')
    out = []
    for item in raw:
        if not isinstance(item, list) or len(item) != 6 or any(type(v) is not int for v in item):
            raise ValueError('object must have six integers')
        color, area, x0, y0, x1, y1 = item
        if not (0 <= color <= 255 and 1 <= area <= 4096 and
                0 <= x0 <= x1 < 64 and 0 <= y0 <= y1 < 64):
            raise ValueError('invalid object bounds')
        out.append(tuple(item))
    return tuple(sorted(out))


def classify(before, after):
    """Classify observed effect AFTER outcome; never use as a forecast."""
    a, b = _scene(before), _scene(after)
    if a == b:
        return 'static'
    if len(a) != len(b):
        return 'object_count_change'
    if a:
        # Global translation: all object colors/areas/geometries preserved.
        for first in a[:1]:
            for second in b:
                if first[:2] != second[:2]:
                    continue
                dx, dy = second[2]-first[2], second[3]-first[3]
                if dx == 0 and dy == 0:
                    continue
                shifted = tuple(sorted((c, area, x0+dx, y0+dy, x1+dx, y1+dy)
                                       for c, area, x0, y0, x1, y1 in a))
                if shifted == b:
                    return 'global_translate'
        # One consistent recolor across all matching-color objects.
        for x in a:
            for y in b:
                if x[1:] != y[1:] or x[0] == y[0]:
                    continue
                recolored = tuple(sorted((y[0] if z[0] == x[0] else z[0], *z[1:]) for z in a))
                if recolored == b:
                    return 'global_recolor'
    removed = list((Counter(a)-Counter(b)).elements())
    added = list((Counter(b)-Counter(a)).elements())
    if len(removed) == len(added) == 1:
        x, y = removed[0], added[0]
        if (x[:2] == y[:2] and x[4]-x[2] == y[4]-y[2] and
                x[5]-x[3] == y[5]-y[3] and x[2:] != y[2:]):
            return 'single_object_translate'
        if x[1:] == y[1:] and x[0] != y[0]:
            return 'single_object_recolor'
    return 'unexplained'


def evaluate(records, max_records=4096):
    if type(max_records) is not int or not 1 <= max_records <= 100000:
        raise ValueError('invalid max_records')
    classes = {key: 0 for key in CLASSES}
    seen = {}
    current_game = None
    current_level = None
    last_turn = -1
    stats = dict(records=0, same_level_records=0, reset_records=0,
                 level_advance_records=0, replay_evaluated=0,
                 replay_correct=0, static_on_replay_correct=0,
                 replay_nonstatic=0, replay_ambiguous=0,
                 static_correct=0)
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
        if (game != current_game or lb != current_level or
                turn != last_turn + 1):
            seen = {}
        current_game, current_level, last_turn = game, lb, turn
        if action == 'RESET':
            stats['reset_records'] += 1
            seen = {}
            continue
        if lb != la:
            stats['level_advance_records'] += 1
            seen = {}
            current_level = la
            continue
        stats['same_level_records'] += 1
        kind = classify([list(x) for x in before], [list(x) for x in after])
        classes[kind] += 1
        stats['static_correct'] += int(before == after)
        key = (action, before)
        if key in seen:
            outcomes = seen[key]
            stats['replay_evaluated'] += 1
            if len(outcomes) == 1:
                prediction = next(iter(outcomes))
                stats['replay_nonstatic'] += int(prediction != before)
            else:
                prediction = before
                stats['replay_ambiguous'] += 1
            stats['replay_correct'] += int(prediction == after)
            stats['static_on_replay_correct'] += int(before == after)
        seen.setdefault(key, set()).add(after)
    return {**stats, 'classes': classes,
            'posthoc_global_expressible': sum(classes[k] for k in CLASSES[:3]),
            'posthoc_global_or_single_expressible': sum(classes[k] for k in CLASSES[:5]),
            'effect_on_agent': 'NONE_SHADOW_ONLY',
            'claim': 'posthoc_expressibility_ceiling_and_same_episode_prequential_exact_replay_not_kaggle_score'}


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: effect_coverage_audit.py PUBLIC_TRANSITIONS.jsonl')
    with Path(sys.argv[1]).open(encoding='utf-8') as f:
        print(json.dumps(evaluate(json.loads(line) for line in f if line.strip()), sort_keys=True))


if __name__ == '__main__':
    main()
