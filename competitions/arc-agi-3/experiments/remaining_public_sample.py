"""Frozen nine-game PUBLIC shadow replication of prior one-object predictions.

Outcome-blind protocol. The nine games are the complement of 2 diagnostic,
6 spatial-replication and 8 longer prospective public games. All 25 public
games were previously seen in aggregate benchmarks: NOT a hidden holdout.
No policy imports, no Kaggle submission, no per-game tuning.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

from disjoint_public_sample import (PUBLIC_GAME_IDS, PRIOR_DIAGNOSTIC_GAMES,
                                    select_disjoint_games)
from prospective_public_sample import select_prospective_games
from single_object_prequential import evaluate as evaluate_prequential

PROTOCOL_VERSION = 'arc-agi3.remaining-public-v1'
FROZEN_GAMES = ('su15', 'bp35', 'wa30', 'ft09', 'sk48',
                're86', 'm0r0', 's5i5', 'sb26')
HORIZON = 96
ACCEPTANCE_GATES = {
    'min_positive_games': 3,
    'max_negative_games': 0,
    'min_effect_forecasts': 30,
    'min_games_with_effect_forecasts': 3,
    'min_progress_events': 3,
    'automatic_policy_promotion': False,
}


def select_remaining_games(public_game_ids=PUBLIC_GAME_IDS) -> tuple[str, ...]:
    """Fail closed on roster drift or any overlap with previously detailed games."""
    if (not isinstance(public_game_ids, (list, tuple)) or
            len(public_game_ids) != len(PUBLIC_GAME_IDS) or
            any(not isinstance(g, str) for g in public_game_ids) or
            len(set(public_game_ids)) != len(PUBLIC_GAME_IDS) or
            set(public_game_ids) != set(PUBLIC_GAME_IDS)):
        raise ValueError('public roster changed; cannot change frozen replication')
    prior = (set(PRIOR_DIAGNOSTIC_GAMES) | set(select_disjoint_games()) |
             set(select_prospective_games()))
    if set(public_game_ids) - prior != set(FROZEN_GAMES) or prior & set(FROZEN_GAMES):
        raise ValueError('frozen public partition changed')
    return FROZEN_GAMES


def evaluate_remaining(records):
    """Strict ordered trace, one unchanged prequential evaluator per game.

    All predictions are scored by the existing evaluator before observing the
    current outcome; RESET and level boundaries clear its learned state.
    """
    games = select_remaining_games()
    grouped = {game: [] for game in games}
    game_index = 0
    last_turn = -1
    count = 0
    for row in records:
        count += 1
        if count > len(games) * HORIZON:
            raise ValueError('public trace exceeds frozen record budget')
        if not isinstance(row, dict) or game_index >= len(games):
            raise ValueError('invalid or unexpected trace record')
        game = row.get('game_id')
        turn = row.get('turn')
        if game != games[game_index]:
            if (game_index + 1 >= len(games) or game != games[game_index + 1] or
                    not grouped[games[game_index]]):
                raise ValueError('missing, repeated, or out-of-order public game')
            game_index += 1
            last_turn = -1
        if type(turn) is not int or turn != last_turn + 1 or turn >= HORIZON:
            raise ValueError('noncontiguous turn or exceeded frozen horizon')
        grouped[game].append(row)
        last_turn = turn
    if game_index != len(games) - 1 or any(not rows for rows in grouped.values()):
        raise ValueError('all nine frozen public games must appear')

    per_game = {}
    totals = {}
    for game, rows in grouped.items():
        stats = evaluate_prequential(rows, max_records=HORIZON)
        delta = stats['combined_correct'] - stats['replay_correct']
        per_game[game] = {
            **{key: val for key, val in stats.items() if type(val) is int},
            'delta_correct_vs_replay': delta,
        }
        for key, val in stats.items():
            if type(val) is int:
                totals[key] = totals.get(key, 0) + val
    totals['delta_correct_vs_replay'] = (totals['combined_correct'] -
                                         totals['replay_correct'])
    positive = sum(v['delta_correct_vs_replay'] > 0 for v in per_game.values())
    negative = sum(v['delta_correct_vs_replay'] < 0 for v in per_game.values())
    effect_games = sum(v['effect_nonstatic'] > 0 for v in per_game.values())
    passes = (positive >= ACCEPTANCE_GATES['min_positive_games'] and
              negative <= ACCEPTANCE_GATES['max_negative_games'] and
              totals['effect_nonstatic'] >= ACCEPTANCE_GATES['min_effect_forecasts'] and
              effect_games >= ACCEPTANCE_GATES['min_games_with_effect_forecasts'] and
              totals['level_advance_records'] >= ACCEPTANCE_GATES['min_progress_events'])
    return {
        'protocol': PROTOCOL_VERSION,
        'frozen_games': list(games),
        'horizon': HORIZON,
        'per_game': per_game,
        'total': totals,
        'acceptance': {
            'positive_games': positive,
            'negative_games': negative,
            'games_with_effect_forecasts': effect_games,
            'gates_passed': passes,
            'result': 'RESEARCH_GATE_PASS_NO_AUTOMATIC_PROMOTION' if passes
                      else 'REJECT_POLICY_INTEGRATION',
        },
        'effect_on_agent': 'NONE_SHADOW_ONLY',
        'caveat': 'PUBLIC previously aggregate-benchmarked games; not hidden or uncontaminated holdout',
    }


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: remaining_public_sample.py PUBLIC_TRANSITIONS.jsonl')
    with Path(sys.argv[1]).open(encoding='utf-8') as f:
        print(json.dumps(evaluate_remaining(json.loads(line) for line in f if line.strip()),
                         sort_keys=True))


if __name__ == '__main__':
    main()
