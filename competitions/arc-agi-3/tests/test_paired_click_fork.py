"""Contract tests for a one-action, same-prefix public-game fork. No ARC runtime needed."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from paired_click_fork import choose_alternative, summarize_fork


class PairedClickForkContract(unittest.TestCase):
    def setUp(self):
        self.grid = [[0 for _ in range(64)] for _ in range(64)]
        self.grid[10][10] = 3
        self.grid[11][11] = 4
        self.grid[50][50] = 3

    def test_nearest_different_color_salient_target(self):
        self.assertEqual(choose_alternative([(10, 10), (50, 50), (11, 11)], (10, 10), self.grid), (11, 11))

    def test_fallback_deterministic_when_no_other_color(self):
        self.assertEqual(choose_alternative([(10, 10), (50, 50)], (10, 10), self.grid), (50, 50))

    def test_abstains_when_no_distinct_legal_target(self):
        self.assertIsNone(choose_alternative([(10, 10), (10, 10), (-1, 5)], (10, 10), self.grid))

    def test_rejects_invalid_grid_coordinate(self):
        self.assertEqual(choose_alternative([(10, 10), (64, 10), (11, 11)], (10, 10), self.grid), (11, 11))

    def test_equal_next_state_no_effect(self):
        self.assertEqual(summarize_fork("a", "a", "a", 0, 0, 0)["next_visible_diverged"], False)

    def test_visible_difference_without_progress_not_a_win(self):
        s = summarize_fork("a", "a", "b", 0, 0, 0)
        self.assertTrue(s["next_visible_diverged"])
        self.assertFalse(s["candidate_progress_advantage"])

    def test_candidate_progress_and_regression(self):
        self.assertTrue(summarize_fork("a", "b", "c", 0, 0, 1)["candidate_progress_advantage"])
        self.assertTrue(summarize_fork("a", "b", "c", 0, 1, 0)["candidate_progress_regression"])


if __name__ == "__main__":
    unittest.main()
