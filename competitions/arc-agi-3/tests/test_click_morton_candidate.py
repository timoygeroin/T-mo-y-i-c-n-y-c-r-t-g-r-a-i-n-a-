"""Test-first contracts for a research-only spatially dispersed click candidate.

Pre-registered hypotheses: H0 frozen policy no worse; H1 after 96 stagnant
click-only actions, a spatially dispersed Morton ordering improves coverage
and level progress over both frozen and row-major; H2 row-major is superior.
All public games are previously observed: no held-out generalization claim.
"""
from __future__ import annotations
import sys
from pathlib import Path
import types
import unittest

from test_agent import FrameData, GameAction, MyAgent as Frozen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from click_morton_variant import generate

SOURCE = (ROOT / "agent" / "my_agent.py").read_text()


def candidate(threshold=96):
    module = types.ModuleType("morton_candidate")
    exec(compile(generate(SOURCE, threshold), "<morton>", "exec"), module.__dict__)
    return module.MyAgent


class MortonResearchContracts(unittest.TestCase):
    def test_first_four_uniform_targets_spatially_dispersed(self):
        cls = candidate()
        agent = cls(game_id="unseen")
        agent._click_only = True
        grid = [[0] * 64 for _ in range(64)]
        key = agent._key(0, [grid])
        first = [agent._pick_click(key, [grid]) for _ in range(4)]
        self.assertEqual(first, [(4, 5), (36, 5), (4, 35), (36, 35)])

    def test_early_click_only_behavior_matches_frozen(self):
        cls = candidate()
        a, b = Frozen(game_id="unseen"), cls(game_id="unseen")
        grid = [[0] * 64 for _ in range(64)]
        obs = FrameData(frame=[grid], available_actions=[GameAction.ACTION6], levels_completed=0)
        for _ in range(12):
            aa, bb = a.choose_action([], obs), b.choose_action([], obs)
            self.assertEqual((aa.name, aa.data), (bb.name, bb.data))
            self.assertFalse(b._click_only)

    def test_gate_only_after_threshold_at_level_zero(self):
        cls = candidate()
        obs = FrameData(frame=[[[0] * 64 for _ in range(64)]], available_actions=[GameAction.ACTION6], levels_completed=0)
        agent = cls(game_id="unseen")
        agent._steps = 95
        agent.choose_action([], obs)
        self.assertFalse(agent._click_only)
        agent.choose_action([], obs)
        self.assertTrue(agent._click_only)

    def test_mixed_actions_and_post_level_never_switch(self):
        cls = candidate()
        for actions, level in [([GameAction.ACTION1, GameAction.ACTION6], 0), ([GameAction.ACTION6], 1)]:
            agent = cls(game_id="unseen")
            agent._steps = 200
            obs = FrameData(frame=[[[0] * 64 for _ in range(64)]], available_actions=actions, levels_completed=level)
            agent.choose_action([], obs)
            self.assertFalse(agent._click_only)

    def test_guard_and_invalid_threshold(self):
        with self.assertRaises(ValueError):
            generate(SOURCE.replace("MAX_CLICKS = 80", "MAX_CLICKS = 79"))
        with self.assertRaises(ValueError):
            generate(SOURCE, 0)


if __name__ == "__main__":
    unittest.main()
