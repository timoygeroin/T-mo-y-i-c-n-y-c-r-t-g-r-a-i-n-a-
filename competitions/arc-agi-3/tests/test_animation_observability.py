"""Pre-outcome contract for an isolated animation observability probe.

H0: official public frames are terminal-only or animation adds no information.
H1: multi-frame transitions contain masked-playfield transients absent in terminal
    images, so the frozen terminal-only memory loses observable action effects.
H2: transient changes are mostly HUD/animation and do not predict level progress.
The probe must not change policy; public levels/score remain control outcomes.
"""
from __future__ import annotations
import contextlib
import io
from pathlib import Path
import sys
import types
import unittest
from test_agent import FrameData, GameAction, MyAgent as Frozen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from animation_observability_variant import generate

SOURCE = (ROOT / "agent" / "my_agent.py").read_text()

def candidate():
    mod = types.ModuleType("animation_observability_candidate")
    exec(compile(generate(SOURCE), "<animation-observability>", "exec"), mod.__dict__)
    return mod.MyAgent

class AnimationObservabilityTests(unittest.TestCase):
    def setUp(self):
        self.grid = [[0] * 64 for _ in range(64)]
        self.grid[20][20] = 3

    def test_terminal_reversion_is_logged_without_policy_mutation(self):
        cls = candidate()
        baseline, shadow = Frozen(game_id="probe"), cls(game_id="probe")
        before = FrameData(frame=[self.grid], available_actions=[GameAction.ACTION1])
        a, b = baseline.choose_action([], before), shadow.choose_action([], before)
        self.assertEqual(a.name, b.name)
        middle = [row[:] for row in self.grid]
        middle[20][20] = 5
        obs = FrameData(frame=[middle, self.grid],
                        available_actions=[GameAction.ACTION1])
        with contextlib.redirect_stdout(io.StringIO()) as output:
            a, b = baseline.choose_action([], obs), shadow.choose_action([], obs)
        self.assertEqual(a.name, b.name)
        self.assertEqual(baseline._dead_actions, shadow._dead_actions)
        self.assertIn("ARC_ANIMATION_PROBE", output.getvalue())
        self.assertIn("reverted=1", output.getvalue())

    def test_single_frame_does_not_emit_probe(self):
        cls = candidate()
        shadow = cls(game_id="probe")
        obs = FrameData(frame=[self.grid], available_actions=[GameAction.ACTION1])
        with contextlib.redirect_stdout(io.StringIO()) as output:
            shadow.choose_action([], obs)
            shadow.choose_action([], obs)
        self.assertNotIn("ARC_ANIMATION_PROBE", output.getvalue())

    def test_generator_rejects_source_drift(self):
        with self.assertRaises(ValueError):
            generate(SOURCE.replace("        previous=self._last_observation\n",
                                    "        previous = self._last_observation\n"))

if __name__ == "__main__":
    unittest.main()
