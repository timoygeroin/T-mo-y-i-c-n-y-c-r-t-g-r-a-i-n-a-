"""Test-first, isolated click-coverage public A/B hypotheses (not a score claim)."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import types
import unittest

# Imports the existing contract's official-runtime stubs, not a game simulator.
from test_agent import FrameData, GameAction
from click_coverage_variant import generate

BASE = Path(__file__).resolve().parents[1] / "agent" / "my_agent.py"


def candidate(kind: str):
    source = generate(BASE.read_text(), kind)
    module = types.ModuleType("isolated_" + kind)
    exec(compile(source, "<isolated-" + kind + ">", "exec"), module.__dict__)
    return module.MyAgent


class ClickCoverageCandidateTests(unittest.TestCase):
    def test_frozen_agent_is_not_mutated(self):
        before = BASE.read_bytes()
        for kind in ("coverage", "grid_first"):
            self.assertNotEqual(generate(before.decode(), kind), before.decode())
        self.assertEqual(BASE.read_bytes(), before)

    def test_variant_generation_has_exact_guard(self):
        with self.assertRaises(ValueError):
            generate("MAX_CLICKS = 81", "coverage")
        with self.assertRaises(ValueError):
            generate(BASE.read_text(), "unregistered")

    def test_both_candidates_are_valid_single_file_agents(self):
        for kind in ("coverage", "grid_first"):
            cls = candidate(kind)
            self.assertEqual(cls.MAX_CLICKS, 114)
            a = cls(game_id="synthetic")
            grid = [[0] * 64 for _ in range(64)]
            obs = FrameData(frame=[grid], available_actions=[GameAction.ACTION6])
            for _ in range(3):
                action = a.choose_action([], obs)
                self.assertEqual(action, GameAction.ACTION6)
                self.assertTrue(1 <= action.payload["x"] < 64)
                self.assertTrue(2 <= action.payload["y"] < 61)

    def test_grid_first_prioritizes_spatial_probes_on_dense_scene(self):
        # Many rare objects crowd out the last 34 uniform cells at MAX_CLICKS=80.
        grid = [[0] * 64 for _ in range(64)]
        for y in range(3, 60, 8):
            for x in range(3, 60, 8):
                grid[y][x] = 1
        baseline = candidate("coverage")(game_id="synthetic")
        grid_first = candidate("grid_first")(game_id="synthetic")
        obs = FrameData(frame=[grid], available_actions=[GameAction.ACTION6])
        baseline.choose_action([], obs)
        first_salient = baseline._last_position
        grid_first.choose_action([], obs)
        first_uniform = grid_first._last_position
        self.assertNotEqual(first_salient, first_uniform)
        self.assertIn(first_uniform, candidate("grid_first")._salient_points([grid])[:8])
        self.assertGreater(len(candidate("coverage")._salient_points([grid])), 80)

    def test_no_game_id_special_case(self):
        for kind in ("coverage", "grid_first"):
            cls = candidate(kind)
            for game_id in ("unseen-game-a", "unseen-game-b"):
                agent = cls(game_id=game_id)
                obs = FrameData(frame=[[[0]*64 for _ in range(64)]],
                                available_actions=[GameAction.ACTION6])
                self.assertEqual(agent.choose_action([], obs), GameAction.ACTION6)


if __name__ == "__main__":
    unittest.main()
