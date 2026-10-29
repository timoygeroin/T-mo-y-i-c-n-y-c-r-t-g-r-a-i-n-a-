"""UL-001: test-first local causal neighborhood probe, shadow candidate only."""
from __future__ import annotations
import sys
import types
import unittest
from pathlib import Path
from test_agent import MyAgent as Frozen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from click_local_causal_variant import generate

SOURCE = (Path(__file__).resolve().parents[1] / "agent" / "my_agent.py").read_text()


def candidate():
    module = types.ModuleType("ul001_candidate")
    exec(compile(generate(SOURCE), "<ul001>", "exec"), module.__dict__)
    return module.MyAgent


class LocalCausalProbeTests(unittest.TestCase):
    def test_no_witnessed_success_preserves_frozen_order(self):
        cls = candidate()
        frozen = Frozen(game_id="unseen")
        trial = cls(game_id="unseen")
        points = [(50, 50), (12, 12)]
        frozen._salient_points = lambda grids: points
        trial._salient_points = lambda grids: points
        trial._causal_local_probe = True
        key = (0, "same-frame")
        self.assertEqual(frozen._pick_click(key, []), trial._pick_click(key, []))

    def test_success_neighborhood_can_be_explored_without_repeating_same_click(self):
        cls = candidate()
        trial = cls(game_id="unseen")
        trial._salient_points = lambda grids: [(50, 50), (12, 12), (10, 10)]
        trial._causal_local_probe = True
        trial._click_successes[(0, 10, 10)] = 2
        key = (0, "same-frame")
        self.assertEqual((12, 12), trial._pick_click(key, []))

    def test_not_active_without_gate(self):
        cls = candidate()
        trial = cls(game_id="unseen")
        trial._salient_points = lambda grids: [(50, 50), (12, 12)]
        trial._click_successes[(0, 10, 10)] = 2
        self.assertEqual((50, 50), trial._pick_click((0, "same-frame"), []))

    def test_source_guard(self):
        with self.assertRaises(ValueError):
            generate(SOURCE.replace("MAX_CLICKS = 80", "MAX_CLICKS = 79"))


if __name__ == "__main__":
    unittest.main()
