"""Test-first strict-prior, action-conditioned public-effect instrumentation.
No policy change and no synthetic score claim.
"""
from __future__ import annotations
import contextlib
import io
import json
from pathlib import Path
import sys
import types
import unittest
from test_agent import FrameData, GameAction, MyAgent as Frozen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from causal_effect_probe import generate, parse_trace

SOURCE = (Path(__file__).resolve().parents[1] / "agent" / "my_agent.py").read_text()


def instrumented():
    module = types.ModuleType("causal_probe")
    exec(compile(generate(SOURCE), "<causal-probe>", "exec"), module.__dict__)
    return module.MyAgent


def obs(value, actions=None):
    grid = [[0] * 64 for _ in range(64)]
    grid[20][20] = value
    return FrameData(frame=[grid], available_actions=actions or [GameAction.ACTION6],
                     levels_completed=0)


class CausalEffectProbeTests(unittest.TestCase):
    def test_source_is_immutable_and_fail_closed(self):
        original = SOURCE
        candidate = generate(original)
        self.assertEqual(SOURCE, original)
        self.assertIn("MONDAYID_FORECAST_V1 ", candidate)
        with self.assertRaises(ValueError):
            generate(original.replace("self._steps+=1", "self._steps += 1"))

    def test_action_and_coordinates_preserved(self):
        cls = instrumented()
        a, b = Frozen(game_id="probe"), cls(game_id="probe")
        frames = [obs(1), obs(2), obs(3)]
        with contextlib.redirect_stdout(io.StringIO()):
            for frame in frames:
                x, y = a.choose_action([], frame), b.choose_action([], frame)
                self.assertEqual(x.name, y.name)
                self.assertEqual(getattr(x, "data", None), getattr(y, "data", None))

    def test_strict_prior_forecast_and_exact_click_identity(self):
        cls = instrumented()
        agent = cls(game_id="probe")
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            agent.choose_action([], obs(1))
            agent.choose_action([], obs(2))
            agent.choose_action([], obs(3))
        rows = parse_trace(output.getvalue())
        self.assertEqual(len(rows["forecast"]), 3)
        self.assertEqual(len(rows["outcome"]), 2)
        first = rows["forecast"][0]
        self.assertIsNone(first["predictions"]["H1_action"])
        self.assertIsNone(first["predictions"]["H2_exact"])
        self.assertTrue(first["action"].startswith("ACTION6@"))
        self.assertEqual(rows["outcome"][0]["step"], first["step"])
        self.assertTrue(rows["outcome"][0]["actual"]["changed"])
        self.assertEqual(rows["forecast"][1]["predictions"]["H1_action"],
                         rows["outcome"][0]["actual"])
        self.assertTrue(rows["forecast"][1]["step"] > first["step"])

    def test_trace_parser_rejects_missing_preaction_commit(self):
        with self.assertRaises(ValueError):
            parse_trace('MONDAYID_OUTCOME_V1 {"step":1,"actual":{"changed":true,"progressed":false}}\n')


if __name__ == "__main__":
    unittest.main()
