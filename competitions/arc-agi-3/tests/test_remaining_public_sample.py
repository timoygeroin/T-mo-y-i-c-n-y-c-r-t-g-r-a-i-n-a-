"""Frozen, outcome-blind nine-game shadow replication contracts."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'experiments'))
from disjoint_public_sample import PUBLIC_GAME_IDS, PRIOR_DIAGNOSTIC_GAMES, select_disjoint_games
from prospective_public_sample import select_prospective_games
from remaining_public_sample import (FROZEN_GAMES, HORIZON, PROTOCOL_VERSION,
                                     ACCEPTANCE_GATES, select_remaining_games,
                                     evaluate_remaining)


def scene(x):
    return [[2, 1, x, 2, x, 2], [5, 1, 30, 30, 30, 30]]


def row(game, turn, before, after, action='ACTION1', lb=0, la=None):
    return dict(schema='arc-agi3.shadow-transition.v1', game_id=game,
                turn=turn, action_key=action, legal_actions=['ACTION1'],
                level_before=lb, level_after=lb if la is None else la,
                before_scene=before, after_scene=after)


def minimal_rows():
    return [row(game, 0, scene(3), scene(3)) for game in FROZEN_GAMES]


class RemainingPublicSampleTests(unittest.TestCase):
    def test_exact_frozen_partition(self):
        self.assertEqual(FROZEN_GAMES, ('su15', 'bp35', 'wa30', 'ft09', 'sk48',
                                        're86', 'm0r0', 's5i5', 'sb26'))
        self.assertEqual(select_remaining_games(), FROZEN_GAMES)
        earlier = set(PRIOR_DIAGNOSTIC_GAMES) | set(select_disjoint_games()) | set(select_prospective_games())
        self.assertEqual(set(FROZEN_GAMES) & earlier, set())
        self.assertEqual(earlier | set(FROZEN_GAMES), set(PUBLIC_GAME_IDS))
        self.assertEqual(len(earlier), 16)
        self.assertEqual(len(FROZEN_GAMES), 9)

    def test_frozen_protocol_and_gates(self):
        self.assertEqual(PROTOCOL_VERSION, 'arc-agi3.remaining-public-v1')
        self.assertEqual(HORIZON, 96)
        self.assertEqual(ACCEPTANCE_GATES['min_positive_games'], 3)
        self.assertEqual(ACCEPTANCE_GATES['max_negative_games'], 0)
        self.assertEqual(ACCEPTANCE_GATES['min_progress_events'], 3)
        self.assertFalse(ACCEPTANCE_GATES['automatic_policy_promotion'])

    def test_reordering_roster_does_not_change_sample(self):
        self.assertEqual(select_remaining_games(tuple(reversed(PUBLIC_GAME_IDS))), FROZEN_GAMES)

    def test_roster_drift_fails_closed(self):
        for roster in (PUBLIC_GAME_IDS[:-1], PUBLIC_GAME_IDS + ('unknown',),
                       PUBLIC_GAME_IDS[:-1] + (PUBLIC_GAME_IDS[0],)):
            with self.assertRaises(ValueError):
                select_remaining_games(roster)

    def test_all_games_appear_once_in_order(self):
        result = evaluate_remaining(minimal_rows())
        self.assertEqual(result['total']['records'], 9)
        self.assertEqual(result['total']['same_level_records'], 9)
        self.assertEqual(result['total']['static_correct'], 9)
        self.assertEqual(result['total']['combined_correct'], 9)
        self.assertEqual(list(result['per_game']), list(FROZEN_GAMES))
        self.assertEqual(result['acceptance']['result'], 'REJECT_POLICY_INTEGRATION')

    def test_prequential_effect_and_no_cross_game_transfer(self):
        records = []
        for game in FROZEN_GAMES:
            if game == FROZEN_GAMES[0]:
                records.extend([row(game, 0, scene(3), scene(4)),
                                row(game, 1, scene(12), scene(13))])
            else:
                records.append(row(game, 0, scene(12), scene(12)))
        result = evaluate_remaining(records)
        self.assertEqual(result['total']['records'], 10)
        self.assertEqual(result['total']['effect_nonstatic'], 1)
        self.assertEqual(result['total']['effect_nonstatic_correct'], 1)
        self.assertEqual(result['per_game'][FROZEN_GAMES[0]]['delta_correct_vs_replay'], 1)
        self.assertTrue(all(result['per_game'][g]['effect_nonstatic'] == 0 for g in FROZEN_GAMES[1:]))
        self.assertEqual(result['acceptance']['positive_games'], 1)
        self.assertEqual(result['acceptance']['result'], 'REJECT_POLICY_INTEGRATION')

    def test_wrong_game_order_missing_game_and_duplicate_rejected(self):
        rows = minimal_rows()
        for bad in ([], rows[:-1], rows + [rows[-1]],
                    [rows[1], rows[0]] + rows[2:],
                    [dict(rows[0], game_id='ls20')] + rows[1:]):
            with self.assertRaises(ValueError):
                evaluate_remaining(bad)

    def test_turn_gaps_nonzero_first_turn_and_horizon_rejected(self):
        rows = minimal_rows()
        for first in (dict(rows[0], turn=1), dict(rows[0], turn=96)):
            with self.assertRaises(ValueError):
                evaluate_remaining([first] + rows[1:])
        with self.assertRaises(ValueError):
            evaluate_remaining([row(FROZEN_GAMES[0], t, scene(3), scene(3)) for t in range(97)] + rows[1:])
        with self.assertRaises(ValueError):
            evaluate_remaining([rows[0], dict(rows[0], turn=2)] + rows[1:])

    def test_reset_boundary_not_treated_as_training_or_forecast(self):
        rows = [row(FROZEN_GAMES[0], 0, scene(3), scene(4)),
                row(FROZEN_GAMES[0], 1, scene(3), scene(3), action='RESET'),
                row(FROZEN_GAMES[0], 2, scene(12), scene(12))]
        rows.extend(minimal_rows()[1:])
        result = evaluate_remaining(rows)
        self.assertEqual(result['total']['reset_records'], 1)
        self.assertEqual(result['total']['effect_nonstatic'], 0)


if __name__ == '__main__':
    unittest.main()
