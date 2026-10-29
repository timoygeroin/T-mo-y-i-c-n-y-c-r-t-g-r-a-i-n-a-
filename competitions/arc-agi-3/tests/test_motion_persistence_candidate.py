"""Pre-registered isolated directional-persistence ablation; synthetic gates only.

H0: frozen novelty bonus +0.55 is at least as effective.
H1: stronger same-direction continuation after an observed novel change
    reduces unnecessary switching without repeating no-op actions.
No game IDs, no public-score assumptions, no Kaggle integration.
"""
import importlib.util
from pathlib import Path
import unittest

from test_agent import FrameData, GameAction

P = Path(__file__).resolve().parents[1] / "agent" / "candidate_motion_persistence.py"
spec = importlib.util.spec_from_file_location("monday_motion_candidate", P)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
MyAgent = module.MyAgent


class MotionPersistenceTests(unittest.TestCase):
    def test_continue_direction_when_new_visible_state_competes_with_novelty(self):
        agent = MyAgent(game_id="synthetic-motion")
        old = [[0] * 8 for _ in range(8)]
        new = [[0] * 8 for _ in range(8)]
        new[3][4] = 2
        key = agent._key(0, [new])
        agent._last_move = "ACTION1"
        agent._last_observation = agent._key(0, [old])
        agent._last_grids = [old]
        agent._attempts[(0, key[1], "ACTION1")] = 2
        chosen = agent.choose_action([], FrameData(frame=[new], available_actions=[
            GameAction.ACTION1, GameAction.ACTION2]))
        self.assertEqual(chosen, GameAction.ACTION1)

    def test_noop_is_not_repeated_despite_directional_bonus(self):
        agent = MyAgent(game_id="synthetic-motion")
        obs = FrameData(available_actions=[GameAction.ACTION1, GameAction.ACTION2])
        agent._last_move = "ACTION1"
        agent._last_observation = agent._key(0, obs.frame)
        agent._last_grids = obs.frame
        chosen = agent.choose_action([], obs)
        self.assertEqual(chosen, GameAction.ACTION2)

    def test_no_bonus_for_non_directional_action(self):
        agent = MyAgent(game_id="synthetic-motion")
        old = [[0] * 8 for _ in range(8)]
        new = [[0] * 8 for _ in range(8)]
        new[3][4] = 2
        key = agent._key(0, [new])
        agent._last_move = "ACTION5"
        agent._last_observation = agent._key(0, [old])
        agent._last_grids = [old]
        agent._attempts[(0, key[1], "ACTION5")] = 2
        chosen = agent.choose_action([], FrameData(frame=[new], available_actions=[
            GameAction.ACTION5, GameAction.ACTION2]))
        self.assertEqual(chosen, GameAction.ACTION2)


if __name__ == "__main__":
    unittest.main()
