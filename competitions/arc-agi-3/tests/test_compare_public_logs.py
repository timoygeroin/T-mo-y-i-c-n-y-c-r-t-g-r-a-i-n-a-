"""Contract for public-game A/B log parsing; never a hidden-score claim."""
import importlib.util
from pathlib import Path
import unittest

PATH = Path(__file__).resolve().parents[1] / "tools" / "compare_public_logs.py"
spec = importlib.util.spec_from_file_location("compare_public_logs", PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def log(a, b, score):
    return ("========= SUMMARY =========\n"
            f"  a   levels=  {a}  actions=  121  state=GameState.NOT_FINISHED\n"
            f"  b   levels=  {b}  actions=  121  state=GameState.NOT_FINISHED\n"
            f"Aggregate scorecard score: {score}\n")


class PublicABParserTests(unittest.TestCase):
    def test_paired_public_scorecard(self):
        control = module.parse(log(0, 1, 0.2), expected_games=2)
        candidate = module.parse(log(1, 0, 0.3), expected_games=2)
        result = module.compare(control, candidate)
        self.assertEqual(result["local_score_delta"], 0.09999999999999998)
        self.assertEqual(result["improved_games"], ["a"])
        self.assertEqual(result["regressed_games"], ["b"])
        self.assertFalse(result["auto_promoted"])

    def test_incomplete_or_duplicate_scorecard_fails_closed(self):
        with self.assertRaises(ValueError):
            module.parse(log(1, 0, 0.2), expected_games=25)
        with self.assertRaises(ValueError):
            module.parse(log(1, 0, 0.2) + log(1, 0, 0.2), expected_games=2)

    def test_mismatched_game_sets_rejected(self):
        a = module.parse(log(1, 0, 0.2), expected_games=2)
        b = module.parse(log(0, 1, 0.3).replace("  b   levels=", "  c   levels="), expected_games=2)
        with self.assertRaises(ValueError):
            module.compare(a, b)


if __name__ == "__main__":
    unittest.main()
