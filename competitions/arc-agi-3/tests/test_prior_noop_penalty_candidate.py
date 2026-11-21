"""Test-first strict-prior soft no-op penalty, isolated from the frozen contest agent.

This is an exploratory, same-budget public hypothesis; no score is inferred
from these synthetic contract tests. No game IDs or hidden state used.
"""
from __future__ import annotations

import sys
from pathlib import Path
import types
import unittest
from test_agent import FrameData, GameAction, MyAgent as Frozen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from prior_noop_penalty_variant import generate

SOURCE = (Path(__file__).resolve().parents[1] / "agent" / "my_agent.py").read_text()


def candidate():
    module = types.ModuleType("prior_noop_penalty_candidate")
    exec(compile(generate(SOURCE), "<prior-noop>", "exec"), module.__dict__)
    return module.MyAgent


class PriorNoopPenaltyTests(unittest.TestCase):
    def test_frozen_agent_unchanged_and_generator_guards_source(self):
        self.assertFalse(hasattr(Frozen(game_id="test"), "_noops"))
        with self.assertRaises(ValueError):
            generate(SOURCE.replace("MAX_CLICKS = 80", "MAX_CLICKS = 79"))

    def test_prior_noops_are_observed_only_after_outcome(self):
        a = candidate()(game_id="test")
        grid = [[0, 0], [0, 0]]
        key = a._key(0, [grid])
        action = (0, key[1], "ACTION1")
        self.assertEqual(a._noops[action], 0)
        a._last_move = "ACTION1"
        a._last_observation = key
        a._last_grids = [grid]
        a._record_outcome(key, [grid])
        self.assertEqual(a._noops[action], 1)
        a._record_outcome(key, [grid])
        self.assertEqual(a._noops[action], 2)
        changed = [[0, 1], [0, 0]]
        a._record_outcome(a._key(0, [changed]), [changed])
        self.assertEqual(a._noops[action], 0)

    def test_repeated_noops_softly_deprioritize_cardinal_not_hard_veto(self):
        cls = candidate()
        frozen = Frozen(game_id="test")
        treatment = cls(game_id="test")
        obs = FrameData(available_actions=[GameAction.ACTION1, GameAction.ACTION2])
        key = frozen._key(0, frozen._grids(obs))
        a1 = (0, key[1], "ACTION1")
        a2 = (0, key[1], "ACTION2")
        for agent in (frozen, treatment):
            agent._dead_actions.update((a1, a2))
            agent._attempts[a2] = 8
        treatment._noops[a1] = 5
        treatment._noops[a2] = 1
        self.assertEqual(frozen.choose_action([], obs), GameAction.ACTION1)
        self.assertEqual(treatment.choose_action([], obs), GameAction.ACTION2)

    def test_click_only_trajectory_unchanged(self):
        cls = candidate()
        grid = [[0]*64 for _ in range(64)]
        grid[25][25] = 4
        obs = FrameData(frame=[grid], available_actions=[GameAction.ACTION6])
        frozen, treatment = Frozen(game_id="test"), cls(game_id="test")
        for _ in range(12):
            self.assertEqual(frozen.choose_action([], obs), treatment.choose_action([], obs))
            self.assertEqual(frozen._last_position, treatment._last_position)

    def test_noop_counter_is_bounded_by_state_cap(self):
        a = candidate()(game_id="test")
        a.MAX_STATES = 0
        a._noops[(0, "old", "ACTION1")] = 4
        obs = FrameData(available_actions=[GameAction.ACTION1])
        a.choose_action([], obs)
        self.assertFalse(a._noops)


if __name__ == "__main__":
    unittest.main()
