"""Preregistered affordance-gated click experiment; no game-ID routing."""
from __future__ import annotations
import sys
from pathlib import Path
import types
import unittest
from test_agent import FrameData, GameAction, MyAgent as Frozen
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from click_affordance_variant import generate

SOURCE = (Path(__file__).resolve().parents[1] / "agent" / "my_agent.py").read_text()


def make_agent():
    module = types.ModuleType("affordance_candidate")
    exec(compile(generate(SOURCE), "<affordance>", "exec"), module.__dict__)
    return module.MyAgent


class AffordanceClickTests(unittest.TestCase):
    def test_only_click_action_activates_grid_first(self):
        cls = make_agent()
        agent = cls(game_id="unknown")
        frame = FrameData(frame=[[[0]*64 for _ in range(64)]],
                          available_actions=[GameAction.ACTION6])
        agent.choose_action([], frame)
        self.assertTrue(agent._click_only)
        mixed = FrameData(frame=[[[0]*64 for _ in range(64)]],
                          available_actions=[GameAction.ACTION1, GameAction.ACTION6])
        agent.choose_action([], mixed)
        self.assertFalse(agent._click_only)

    def test_mixed_action_click_policy_is_exactly_frozen(self):
        cls = make_agent()
        grid = [[0]*64 for _ in range(64)]
        for y in range(3, 60, 8):
            for x in range(3, 60, 8):
                grid[y][x] = 1
        frozen = Frozen(game_id="synthetic")
        candidate = cls(game_id="synthetic")
        candidate._click_only = False
        key = frozen._key(0, [grid])
        for _ in range(10):
            self.assertEqual(frozen._pick_click(key, [grid]),
                             candidate._pick_click(key, [grid]))

    def test_click_only_spatial_probe_differs_on_dense_scene(self):
        cls = make_agent()
        grid = [[0]*64 for _ in range(64)]
        for y in range(3, 60, 8):
            for x in range(3, 60, 8):
                grid[y][x] = 1
        frozen = Frozen(game_id="synthetic")
        candidate = cls(game_id="synthetic")
        candidate._click_only = True
        key = frozen._key(0, [grid])
        self.assertNotEqual(frozen._pick_click(key, [grid]),
                            candidate._pick_click(key, [grid]))

    def test_generator_guards_original_source(self):
        with self.assertRaises(ValueError):
            generate(SOURCE.replace("MAX_CLICKS = 80", "MAX_CLICKS = 81"))
        self.assertEqual(Frozen.MAX_CLICKS, 80)
        self.assertEqual(make_agent().MAX_CLICKS, 114)


if __name__ == "__main__":
    unittest.main()
