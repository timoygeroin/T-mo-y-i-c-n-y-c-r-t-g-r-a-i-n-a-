"""Test-first isolated coordinate-aware ACTION6 exploration policy.

H0: global ACTION6 attempt count is a useful regularizer.
H1: distinct click coordinates are distinct experiments; a fresh legal
    click should not inherit the attempt count of unrelated pixels.
No game-ID branches, no hidden data, no policy promotion.
"""
import importlib.util
from pathlib import Path
import unittest
from test_agent import FrameData, GameAction

P = Path(__file__).resolve().parents[1] / "agent" / "candidate_coordinate_novelty.py"
spec = importlib.util.spec_from_file_location("monday_coordinate_novelty_candidate", P)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
MyAgent = module.MyAgent


class CoordinateNoveltyTests(unittest.TestCase):
    def setUp(self):
        self.agent = MyAgent(game_id="synthetic-coordinate-novelty")
        grid = [[3] * 64 for _ in range(64)]
        grid[12][49] = 5
        self.obs = FrameData(frame=[grid], available_actions=[
            GameAction.ACTION5, GameAction.ACTION6])
        self.key = self.agent._key(0, self.obs.frame)

    def test_untried_click_is_not_penalized_by_unrelated_prior_clicks(self):
        self.agent._attempts[(0, self.key[1], "ACTION6")] = 6
        self.agent._attempts[(0, self.key[1], "ACTION5")] = 1
        self.assertEqual(self.agent.choose_action([], self.obs), GameAction.ACTION6)

    def test_exhausted_click_targets_lose_novelty_priority(self):
        for x, y in self.agent._salient_points(self.obs.frame)[:self.agent.MAX_CLICKS]:
            self.agent._click_visits[(0, self.key[1], x, y)] = 6
        self.agent._attempts[(0, self.key[1], "ACTION5")] = 1
        self.assertEqual(self.agent.choose_action([], self.obs), GameAction.ACTION5)

    def test_click_only_game_stays_legal_and_coordinates_bounded(self):
        self.obs.available_actions = [GameAction.ACTION6]
        action = self.agent.choose_action([], self.obs)
        self.assertEqual(action, GameAction.ACTION6)
        self.assertTrue(0 <= action.payload["x"] <= 63)
        self.assertTrue(0 <= action.payload["y"] <= 63)


if __name__ == "__main__":
    unittest.main()
