"""RED/GREEN contract for isolated transient-aware action-veto candidate.

H0: unchanged frozen policy is no worse at the same 500-action budget.
H1: an intermediate playfield change with unchanged terminal frame is useful
    evidence against immediately blacklisting that state/action.
H2: animations are non-progress feedback; allowing extra attempts wastes
    actions or regresses. No game IDs, no synthetic score claims.
"""
from __future__ import annotations
from pathlib import Path
import sys
import types
import unittest
from test_agent import FrameData, GameAction, MyAgent as Frozen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from animation_veto_variant import generate
SOURCE = (ROOT / "agent" / "my_agent.py").read_text()

def candidate():
    module = types.ModuleType("animation_veto_candidate")
    exec(compile(generate(SOURCE), "<animation-veto>", "exec"), module.__dict__)
    return module.MyAgent

class AnimationVetoTests(unittest.TestCase):
    def setUp(self):
        self.grid = [[0] * 64 for _ in range(64)]
        self.grid[20][20] = 3

    def _run(self, cls, middle=None):
        agent = cls(game_id="test")
        before = FrameData(frame=[self.grid], available_actions=[GameAction.ACTION1])
        agent.choose_action([], before)
        prev = agent._last_observation
        frames = [self.grid] if middle is None else [middle, self.grid]
        agent.choose_action([], FrameData(frame=frames, available_actions=[GameAction.ACTION1]))
        return agent, (prev[0], prev[1], "ACTION1")

    def test_terminal_only_noop_keeps_frozen_veto(self):
        baseline, key = self._run(Frozen)
        treatment, _ = self._run(candidate())
        self.assertIn(key, baseline._dead_actions)
        self.assertIn(key, treatment._dead_actions)

    def test_transient_reversion_allows_one_more_probe(self):
        middle = [row[:] for row in self.grid]
        middle[20][20] = 4
        baseline, key = self._run(Frozen, middle)
        treatment, _ = self._run(candidate(), middle)
        self.assertIn(key, baseline._dead_actions)
        self.assertNotIn(key, treatment._dead_actions)
        self.assertEqual(baseline._successes, treatment._successes)

    def test_hud_only_transient_is_ignored(self):
        middle = [row[:] for row in self.grid]
        middle[0][20] = 4
        baseline, key = self._run(Frozen, middle)
        treatment, _ = self._run(candidate(), middle)
        self.assertIn(key, baseline._dead_actions)
        self.assertIn(key, treatment._dead_actions)

    def test_source_guard(self):
        with self.assertRaises(ValueError):
            generate(SOURCE.replace("        elif delta == 0:\n",
                                    "        elif delta==0:\n"))

if __name__ == "__main__":
    unittest.main()
