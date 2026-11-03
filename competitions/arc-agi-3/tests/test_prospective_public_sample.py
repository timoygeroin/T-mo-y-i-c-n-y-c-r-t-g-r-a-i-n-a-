"""Frozen outcome-blind public selection for longer action-causal shadow traces."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'experiments'))
from disjoint_public_sample import PUBLIC_GAME_IDS, PRIOR_DIAGNOSTIC_GAMES, select_disjoint_games
from prospective_public_sample import (SAMPLE_SEED, SAMPLE_SIZE, HORIZON,
    select_prospective_games, PROTOCOL_VERSION, ACCEPTANCE_GATES)


class ProspectiveSampleTests(unittest.TestCase):
    def test_frozen_sample(self):
        self.assertEqual(select_prospective_games(),
            ('lp85', 'tr87', 'sp80', 'g50t', 'dc22', 'r11l', 'tu93', 'ar25'))
        self.assertEqual(SAMPLE_SEED, 'mondayid-arc3-prospective-causal-v1:')
        self.assertEqual(SAMPLE_SIZE, 8)
        self.assertEqual(HORIZON, 96)
        self.assertEqual(PROTOCOL_VERSION, 'arc-agi3.prospective-causal.v1')

    def test_disjoint_from_both_prior_diagnostic_samples(self):
        games = select_prospective_games()
        self.assertEqual(len(games), len(set(games)))
        self.assertTrue(set(games).isdisjoint(PRIOR_DIAGNOSTIC_GAMES))
        self.assertTrue(set(games).isdisjoint(select_disjoint_games()))
        self.assertTrue(set(games).issubset(PUBLIC_GAME_IDS))

    def test_reordering_does_not_change_sample(self):
        self.assertEqual(select_prospective_games(tuple(reversed(PUBLIC_GAME_IDS))),
                         select_prospective_games())

    def test_fail_closed_on_roster_drift_or_duplicates(self):
        with self.assertRaises(ValueError):
            select_prospective_games(PUBLIC_GAME_IDS[:-1])
        with self.assertRaises(ValueError):
            select_prospective_games(PUBLIC_GAME_IDS[:-1] + (PUBLIC_GAME_IDS[0],))
        with self.assertRaises(ValueError):
            select_prospective_games(PUBLIC_GAME_IDS + ('hidden',))

    def test_protocol_limits_and_frozen_gates(self):
        self.assertGreater(HORIZON, 12)
        self.assertLessEqual(HORIZON, 120)
        self.assertEqual(ACCEPTANCE_GATES['min_progress_events'], 3)
        self.assertEqual(ACCEPTANCE_GATES['min_evaluated_pairs'], 100)
        self.assertEqual(ACCEPTANCE_GATES['min_seen_joint_fraction'], 0.25)
        self.assertEqual(ACCEPTANCE_GATES['require_nonregression_vs_action_only'], True)
        self.assertEqual(ACCEPTANCE_GATES['automatic_policy_promotion'], False)

if __name__ == '__main__':
    unittest.main()
