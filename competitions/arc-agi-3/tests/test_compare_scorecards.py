"""Contract tests for paired public-game scorecard comparison."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "compare_scorecards", Path(__file__).resolve().parents[1] / "tools" / "compare_scorecards.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def record(seed, agent, game, score):
    return {"seed": seed, "agent": agent, "game": game, "score": str(score)}


class CompareScorecardsTests(unittest.TestCase):
    def test_paired_delta_and_counts(self):
        rows = [record(1, "monday", "a", 3), record(1, "random", "a", 1),
                record(2, "monday", "b", 0), record(2, "random", "b", 1)]
        result = module.compare(rows)
        self.assertEqual(result["pairs"], 2)
        self.assertEqual(result["mean_paired_delta"], 0.5)
        self.assertEqual((result["wins"], result["ties"], result["losses"]), (1, 0, 1))

    def test_missing_pair_rejected(self):
        with self.assertRaises(ValueError):
            module.compare([record(1, "monday", "a", 1)])

    def test_duplicate_rejected(self):
        with self.assertRaises(ValueError):
            module.compare([record(1, "monday", "a", 1), record(1, "monday", "a", 2),
                            record(1, "random", "a", 0)])

    def test_nonfinite_rejected(self):
        with self.assertRaises(ValueError):
            module.compare([record(1, "monday", "a", "nan"), record(1, "random", "a", 0)])

    def test_single_pair_no_sd(self):
        result = module.compare([record(1, "monday", "a", 1), record(1, "random", "a", 1)])
        self.assertIsNone(result["sample_sd"])
        self.assertEqual(result["ties"], 1)


if __name__ == "__main__":
    unittest.main()
