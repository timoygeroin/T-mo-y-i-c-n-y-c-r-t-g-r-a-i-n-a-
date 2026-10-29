"""UL004 test-first: object-component nonprogress is not level progress.

Isolated public A/B candidate only; official contest agent is frozen.
"""
from __future__ import annotations
import sys
import types
from pathlib import Path
import unittest
from test_agent import MyAgent as Frozen
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from ul004_component_feedback_variant import generate

SOURCE = (Path(__file__).resolve().parents[1] / "agent" / "my_agent.py").read_text()


def candidate():
    module = types.ModuleType("ul004_candidate")
    exec(compile(generate(SOURCE), "<ul004>", "exec"), module.__dict__)
    return module.MyAgent


def sample():
    grid = [[0] * 64 for _ in range(64)]
    grid[10][10] = 1
    grid[20][20] = 2
    return grid


class ComponentFeedbackTests(unittest.TestCase):
    def test_generator_preserves_frozen_contract_and_source_guard(self):
        result = generate(SOURCE)
        self.assertIn("class MyAgent(Agent)", result)
        self.assertIn("MAX_ACTIONS = 500", result)
        self.assertIn("self._object_nonprogress", result)
        with self.assertRaises(ValueError):
            generate(SOURCE.replace("self._click_failures:", "self._click_failed:"))

    def test_pre_feedback_clicks_match_frozen(self):
        cls = candidate()
        frozen, treatment = Frozen(game_id="unseen"), cls(game_id="unseen")
        grid = sample()
        key = frozen._key(0, [grid])
        self.assertEqual(frozen._pick_click(key, [grid]),
                         treatment._pick_click(key, [grid]))

    def test_repeated_nonprogress_changes_physical_click(self):
        cls = candidate()
        frozen, treatment = Frozen(game_id="unseen"), cls(game_id="unseen")
        grid = sample()
        key = frozen._key(0, [grid])
        obj = (2, 1, 20, 20, 20, 20)
        treatment._object_nonprogress[(0, obj)] = 2
        self.assertEqual(frozen._pick_click(key, [grid]), (20, 20))
        self.assertEqual(treatment._pick_click(key, [grid]), (10, 10))

    def test_progress_witness_exempts_object_from_suppression(self):
        cls = candidate()
        treatment = cls(game_id="unseen")
        grid = sample()
        key = treatment._key(0, [grid])
        obj = (2, 1, 20, 20, 20, 20)
        treatment._object_nonprogress[(0, obj)] = 3
        treatment._object_progress[(0, obj)] = 1
        self.assertEqual(treatment._pick_click(key, [grid]), (20, 20))

    def test_real_observed_nonprogress_updates_only_prior_object(self):
        cls = candidate()
        treatment = cls(game_id="unseen")
        old = sample()
        new = sample()
        new[20][20] = 3
        treatment._last_move = "ACTION6"
        treatment._last_position = (20, 20)
        treatment._last_grids = [old]
        treatment._last_observation = treatment._key(0, [old])
        treatment._record_outcome(treatment._key(0, [new]), [new])
        self.assertEqual(treatment._object_nonprogress[(0, (2, 1, 20, 20, 20, 20))], 1)
        self.assertEqual(sum(treatment._object_progress.values()), 0)

    def test_level_advance_records_progress_not_nonprogress(self):
        cls = candidate()
        treatment = cls(game_id="unseen")
        grid = sample()
        treatment._last_move = "ACTION6"
        treatment._last_position = (20, 20)
        treatment._last_grids = [grid]
        treatment._last_observation = treatment._key(0, [grid])
        treatment._record_outcome(treatment._key(1, [grid]), [grid])
        self.assertEqual(treatment._object_progress[(0, (2, 1, 20, 20, 20, 20))], 1)
        self.assertEqual(sum(treatment._object_nonprogress.values()), 0)


if __name__ == "__main__":
    unittest.main()
