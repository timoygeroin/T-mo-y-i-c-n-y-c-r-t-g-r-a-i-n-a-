"""RED-first contract for isolated, unpromoted graph-frontier exploration.

These synthetic state-graph fixtures are NOT evidence of ARC gameplay gain.
"""
import importlib.util
from pathlib import Path
import unittest
from test_agent import GameAction, FrameData

PATH = Path(__file__).resolve().parents[1] / "agent" / "candidate_frontier_agent.py"
spec = importlib.util.spec_from_file_location("arc_frontier_candidate", PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
Candidate = module.MyAgent


class FrontierCandidateTests(unittest.TestCase):
    def setUp(self):
        self.agent = Candidate(game_id="synthetic-frontier")
        self.legal = [GameAction.ACTION1, GameAction.ACTION2]

    def test_shortest_known_path_to_untried_action(self):
        a = self.agent
        for action in self.legal:
            a._attempts[(0, "A", action.name)] = 2
        a._transitions[(0, "A", "ACTION1")] = (0, "C")
        a._transitions[(0, "A", "ACTION2")] = (0, "B")
        a._attempts[(0, "C", "ACTION1")] = 1
        a._attempts[(0, "C", "ACTION2")] = 1
        a._transitions[(0, "C", "ACTION2")] = (0, "D")
        self.assertEqual(a._frontier_step((0, "A"), self.legal), GameAction.ACTION2)

    def test_untried_local_action_preempts_navigation(self):
        a = self.agent
        a._attempts[(0, "A", "ACTION1")] = 1
        a._transitions[(0, "A", "ACTION1")] = (0, "B")
        self.assertIsNone(a._frontier_step((0, "A"), self.legal))

    def test_never_navigates_dead_or_cross_level_edges(self):
        a = self.agent
        for action in self.legal:
            a._attempts[(0, "A", action.name)] = 1
        a._transitions[(0, "A", "ACTION1")] = (1, "future-level")
        a._transitions[(0, "A", "ACTION2")] = (0, "B")
        a._dead_actions.add((0, "A", "ACTION2"))
        self.assertIsNone(a._frontier_step((0, "A"), self.legal))

    def test_proven_progress_preempts_frontier_navigation(self):
        a = self.agent
        for action in self.legal:
            a._attempts[(0, "A", action.name)] = 1
        a._transitions[(0, "A", "ACTION1")] = (1, "next-level")
        a._transitions[(0, "A", "ACTION2")] = (0, "B")
        self.assertIsNone(a._frontier_step((0, "A"), self.legal))

    def test_frontier_controls_actual_action_choice(self):
        a = self.agent
        obs = FrameData(frame=[[[0, 0], [0, 0]]], available_actions=self.legal)
        key = a._key(0, a._grids(obs))
        a._visits[key] = 3
        a._attempts[(0, key[1], "ACTION1")] = 1
        a._attempts[(0, key[1], "ACTION2")] = 8
        a._transitions[(0, key[1], "ACTION2")] = (0, "unexplored-B")
        self.assertEqual(a.choose_action([], obs), GameAction.ACTION2)


if __name__ == "__main__":
    unittest.main()
