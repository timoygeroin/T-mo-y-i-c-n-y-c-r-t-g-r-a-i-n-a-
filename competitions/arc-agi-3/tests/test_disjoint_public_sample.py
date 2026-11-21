"""Frozen public-game sample for shadow-only spatial replication."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'experiments'))
from disjoint_public_sample import (PUBLIC_GAME_IDS, PRIOR_DIAGNOSTIC_GAMES,
                                    SAMPLE_SIZE, SAMPLE_SEED, select_disjoint_games)

class DisjointSampleTests(unittest.TestCase):
    def test_frozen_sample_is_exact_and_disjoint(self):
        self.assertEqual(select_disjoint_games(),
                         ('cd82', 'sc25', 'lf52', 'tn36', 'cn04', 'ka59'))
        self.assertEqual(SAMPLE_SIZE, 6)
        self.assertTrue(set(select_disjoint_games()).isdisjoint(PRIOR_DIAGNOSTIC_GAMES))

    def test_no_replacement_or_duplicates(self):
        selected = select_disjoint_games()
        self.assertEqual(len(selected), len(set(selected)))
        self.assertTrue(set(selected).issubset(PUBLIC_GAME_IDS))
        self.assertEqual(len(PUBLIC_GAME_IDS), 25)

    def test_independent_of_input_order(self):
        self.assertEqual(select_disjoint_games(tuple(reversed(PUBLIC_GAME_IDS))),
                         select_disjoint_games())

    def test_rejects_drifted_or_duplicate_public_roster(self):
        with self.assertRaises(ValueError):
            select_disjoint_games(PUBLIC_GAME_IDS[:-1])
        with self.assertRaises(ValueError):
            select_disjoint_games(PUBLIC_GAME_IDS[:-1] + (PUBLIC_GAME_IDS[0],))
        with self.assertRaises(ValueError):
            select_disjoint_games(PUBLIC_GAME_IDS + ('hidden',))

    def test_seed_is_explicit_and_geometry_is_not_selected_by_outcomes(self):
        self.assertEqual(SAMPLE_SEED, 'mondayid-arc3-spatial-v1:')
        self.assertTrue(all(len(game) == 4 for game in select_disjoint_games()))

if __name__ == '__main__':
    unittest.main()
