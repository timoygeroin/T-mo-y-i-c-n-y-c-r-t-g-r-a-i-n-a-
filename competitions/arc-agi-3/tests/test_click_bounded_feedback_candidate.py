"""UL-002: falsifiable bounded-feedback click policy, isolated from competition agent.

H0: frozen reinforcement is no worse.
H1: after >=3 visible responses at one click coordinate, saturation/penalty
    prevents non-progressing local oscillations and saves actions.
H2: repeat presses are essential and this penalty regresses gameplay.
Synthetic contracts are NOT public gameplay evidence.
"""
from __future__ import annotations

import sys
import types
import unittest
from pathlib import Path

from test_agent import FrameData, GameAction, MyAgent as Frozen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from click_bounded_feedback_variant import generate

SOURCE = (ROOT / "agent" / "my_agent.py").read_text()


def candidate():
    module = types.ModuleType("ul002_bounded_feedback_candidate")
    exec(compile(generate(SOURCE), "<ul002-candidate>", "exec"), module.__dict__)
    return module.MyAgent


def grid_with_two_targets():
    grid = [[0] * 64 for _ in range(64)]
    grid[10][10] = 4
    grid[40][45] = 5
    return grid


class BoundedFeedbackCandidateTests(unittest.TestCase):
    def test_pre_saturation_click_choice_matches_frozen(self):
        cls = candidate()
        grid = grid_with_two_targets()
        key = Frozen._key(0, [grid])
        first = Frozen._salient_points([grid])[0]
        for successes in (0, 1, 2):
            frozen, treatment = Frozen(game_id="unknown"), cls(game_id="unknown")
            frozen._click_successes[(0, *first)] = successes
            treatment._click_successes[(0, *first)] = successes
            self.assertEqual(frozen._pick_click(key, [grid]), treatment._pick_click(key, [grid]))

    def test_after_three_responses_frozen_repeats_but_candidate_explores(self):
        cls = candidate()
        grid = grid_with_two_targets()
        key = Frozen._key(0, [grid])
        first = Frozen._salient_points([grid])[0]
        frozen, treatment = Frozen(game_id="unknown"), cls(game_id="unknown")
        frozen._click_successes[(0, *first)] = 3
        treatment._click_successes[(0, *first)] = 3
        self.assertEqual(frozen._pick_click(key, [grid]), first)
        self.assertNotEqual(treatment._pick_click(key, [grid]), first)

    def test_candidate_remains_legal_offline_single_file_agent(self):
        cls = candidate()
        obs = FrameData(frame=[grid_with_two_targets()],
                        available_actions=[GameAction.ACTION6])
        agent = cls(game_id="heldout-name-not-a-rule")
        for _ in range(5):
            action = agent.choose_action([], obs)
            self.assertEqual(action, GameAction.ACTION6)
            self.assertTrue(0 <= action.payload["x"] <= 63)
            self.assertTrue(0 <= action.payload["y"] <= 63)

    def test_exact_source_guard_and_frozen_immutability(self):
        before = (ROOT / "agent" / "my_agent.py").read_bytes()
        self.assertNotEqual(generate(before.decode()), before.decode())
        with self.assertRaises(ValueError):
            generate(before.decode().replace("MAX_CLICKS = 80", "MAX_CLICKS = 81"))
        self.assertEqual((ROOT / "agent" / "my_agent.py").read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
