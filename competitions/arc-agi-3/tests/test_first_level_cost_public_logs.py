"""Test-first fail-closed action-cost extraction from real-format official public runner logs."""
import importlib.util
from pathlib import Path
import unittest

MODULE = Path(__file__).resolve().parents[1] / "tools" / "compare_public_logs.py"
spec = importlib.util.spec_from_file_location("compare_public_logs", MODULE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def log(rows, score):
    """rows maps game -> pre-action completed-level sequence; preserves shuffled order."""
    lines = []
    for game, levels in rows.items():
        for count, level in enumerate(levels):
            lines.append(f"{game} - ACTION6: count {count}, levels completed {level}, avg fps 10.0)")
    lines.append("========= SUMMARY =========")
    for game, levels in rows.items():
        lines.append(f"  {game}   levels=  {max(levels)}  actions=  {len(levels)}  state=GameState.NOT_FINISHED")
    lines.append(f"Aggregate scorecard score: {score}")
    return "\n".join(lines) + "\n"


class FirstLevelCostTests(unittest.TestCase):
    def test_first_observed_counts_and_score_regression_both_exposed(self):
        frozen = module.parse(log({"a001": [0, 1, 1, 1], "b002": [0, 0, 1, 1]}, 0.50), 2)
        candidate = module.parse(log({"b002": [0, 0, 0, 1], "a001": [0, 0, 1, 1]}, 0.23), 2)
        result = module.compare(frozen, candidate)
        self.assertTrue(result["first_level_action_cost_available"])
        self.assertEqual(result["first_level_action_cost_regressions"], {"a001": 1, "b002": 1})
        self.assertEqual(result["common_first_level_action_cost_delta"], 2)
        self.assertTrue(result["local_score_regression"])
        self.assertEqual(result["regressed_games"], [])
        self.assertFalse(result["auto_promoted"])

    def test_new_level_does_not_hide_regressions(self):
        frozen = module.parse(log({"a001": [0, 1, 1], "b002": [0, 0, 0]}, 0.50), 2)
        candidate = module.parse(log({"a001": [0, 0, 1], "b002": [0, 1, 1]}, 0.25), 2)
        result = module.compare(frozen, candidate)
        self.assertEqual(result["new_first_level_games"], ["b002"])
        self.assertEqual(result["first_level_action_cost_regressions"], {"a001": 1})
        self.assertTrue(result["local_score_regression"])

    def test_partial_action_trace_fails_closed(self):
        bad = log({"a001": [0, 1, 1], "b002": [0, 0, 0]}, 0.5)
        bad = bad.replace("b002 - ACTION6: count 1, levels completed 0, avg fps 10.0)\n", "")
        with self.assertRaises(ValueError):
            module.parse(bad, 2)

    def test_summary_only_abstains_from_action_cost_claims(self):
        frozen = module.parse("a001 levels= 1 actions= 4 state=X\nAggregate scorecard score: 0.5\n", 1)
        candidate = module.parse("a001 levels= 1 actions= 4 state=X\nAggregate scorecard score: 0.6\n", 1)
        result = module.compare(frozen, candidate)
        self.assertFalse(result["first_level_action_cost_available"])
        self.assertEqual(result["first_level_action_cost_regressions"], {})

    def test_unpaired_trace_availability_fails_closed(self):
        frozen = module.parse(log({"a001": [0, 1, 1]}, 0.5), 1)
        candidate = module.parse("a001 levels= 1 actions= 3 state=X\nAggregate scorecard score: 0.6\n", 1)
        with self.assertRaises(ValueError):
            module.compare(frozen, candidate)

    def test_bom_timestamp_prefix_supported(self):
        raw = log({"a001": [0, 1, 1]}, 0.5)
        raw = raw.replace("a001 - ACTION6: count 1", "\ufeff2026-10-30T13:25:56.8537024Z a001 - ACTION6: count 1")
        parsed = module.parse(raw, 1)
        self.assertEqual(parsed["games"]["a001"]["first_level_observed_pre_action_count"], 1)

    def test_duplicate_count_fails_closed(self):
        bad = log({"a001": [0, 1, 1]}, 0.5)
        bad = bad.replace("a001 - ACTION6: count 1", "a001 - ACTION6: count 0")
        with self.assertRaises(ValueError):
            module.parse(bad, 1)


if __name__ == "__main__":
    unittest.main()
