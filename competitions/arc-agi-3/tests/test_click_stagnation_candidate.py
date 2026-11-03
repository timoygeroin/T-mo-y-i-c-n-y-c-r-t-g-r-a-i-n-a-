"""Post-hoc click-only stagnation-switch hypothesis; no game ID special cases."""
from __future__ import annotations
import sys
from pathlib import Path
import types
import unittest
from test_agent import FrameData, GameAction, MyAgent as Frozen
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from click_stagnation_variant import generate

SOURCE = (Path(__file__).resolve().parents[1] / "agent" / "my_agent.py").read_text()


def candidate():
    module = types.ModuleType("stagnation_candidate")
    exec(compile(generate(SOURCE), "<stagnation>", "exec"), module.__dict__)
    return module.MyAgent


class StagnationClickTests(unittest.TestCase):
    def test_first_128_click_only_actions_preserve_baseline(self):
        cls = candidate()
        a = cls(game_id="unseen")
        obs = FrameData(frame=[[[0]*64 for _ in range(64)]],
                        available_actions=[GameAction.ACTION6], levels_completed=0)
        for _ in range(128):
            a.choose_action([], obs)
            self.assertFalse(a._click_only)
        a.choose_action([], obs)
        self.assertTrue(a._click_only)

    def test_switch_never_activates_after_first_level(self):
        cls = candidate()
        a = cls(game_id="unseen")
        a._steps = 200
        obs = FrameData(frame=[[[0]*64 for _ in range(64)]],
                        available_actions=[GameAction.ACTION6], levels_completed=1)
        a.choose_action([], obs)
        self.assertFalse(a._click_only)

    def test_mixed_action_never_activates_even_when_stagnant(self):
        cls = candidate()
        a = cls(game_id="unseen")
        a._steps = 200
        obs = FrameData(frame=[[[0]*64 for _ in range(64)]],
                        available_actions=[GameAction.ACTION1, GameAction.ACTION6])
        a.choose_action([], obs)
        self.assertFalse(a._click_only)

    def test_pre_switch_click_coordinates_match_frozen(self):
        cls = candidate()
        grid = [[0]*64 for _ in range(64)]
        for y in range(3, 60, 8):
            for x in range(3, 60, 8):
                grid[y][x] = 1
        baseline, treatment = Frozen(game_id="unseen"), cls(game_id="unseen")
        key = baseline._key(0, [grid])
        treatment._click_only = False
        for _ in range(12):
            self.assertEqual(baseline._pick_click(key, [grid]),
                             treatment._pick_click(key, [grid]))

    def test_source_guard(self):
        with self.assertRaises(ValueError):
            generate(SOURCE.replace("MAX_CLICKS = 80", "MAX_CLICKS = 79"))


if __name__ == "__main__":
    unittest.main()
