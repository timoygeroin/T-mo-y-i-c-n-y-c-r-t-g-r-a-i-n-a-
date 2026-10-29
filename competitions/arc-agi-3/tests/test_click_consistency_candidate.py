"""Behavioral gate for isolated click-feedback candidate; not a game score."""
import importlib.util
from pathlib import Path
import unittest

from test_agent import GameAction, FrameData

P = Path(__file__).resolve().parents[1] / "agent" / "candidate_click_consistency.py"
spec = importlib.util.spec_from_file_location("monday_click_consistency_candidate", P)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
MyAgent = module.MyAgent


class ClickConsistencyCandidateTests(unittest.TestCase):
    def setUp(self):
        self.agent = MyAgent(game_id="synthetic-click")
        self.grid = [[3] * 64 for _ in range(64)]
        self.grid[12][49] = 5

    def _round_trip(self, changed, *, level=0):
        obs = FrameData(frame=[self.grid], available_actions=[GameAction.ACTION6])
        self.agent.choose_action([], obs)
        x, y = self.agent._last_position
        before_key = self.agent._key(0, [self.grid])
        after = [row[:] for row in self.grid]
        for cx, cy in changed(x, y):
            after[cy][cx] = 7
        self.agent.choose_action([], FrameData(
            frame=[after], available_actions=[GameAction.ACTION6],
            levels_completed=level,
        ))
        return (0, before_key[1], f"ACTION6@{x},{y}"), (0, x, y)

    def test_remote_one_pixel_animation_is_not_click_success_or_proven_transition(self):
        key, coord = self._round_trip(lambda x, y: [(30, 40)])
        self.assertEqual(self.agent._click_failures[coord], 1)
        self.assertEqual(self.agent._successes["ACTION6"], 0)
        self.assertNotIn(key, self.agent._transitions)
        self.assertIn(key, self.agent._dead_actions)

    def test_remote_large_effect_still_records_transition(self):
        key, coord = self._round_trip(lambda x, y: [(col, 40) for col in range(20, 32)])
        self.assertEqual(self.agent._click_successes[coord], 1)
        self.assertEqual(self.agent._successes["ACTION6"], 1)
        self.assertIn(key, self.agent._transitions)

    def test_small_local_click_effect_is_accepted(self):
        key, coord = self._round_trip(lambda x, y: [(x, y)])
        self.assertEqual(self.agent._click_successes[coord], 1)
        self.assertEqual(self.agent._successes["ACTION6"], 1)
        self.assertIn(key, self.agent._transitions)

    def test_level_advance_is_accepted_even_without_pixel_delta(self):
        key, coord = self._round_trip(lambda x, y: [], level=1)
        self.assertEqual(self.agent._click_successes[coord], 1)
        self.assertEqual(self.agent._successes["ACTION6"], 1)
        self.assertEqual(self.agent._transitions[key][0], 1)


if __name__ == "__main__":
    unittest.main()
