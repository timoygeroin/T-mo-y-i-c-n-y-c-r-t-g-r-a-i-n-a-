"""UL-003 preregistered cardinal-motion causal-proxy candidate (shadow until A/B).

H0: frozen novelty policy is no worse at the same action budget.
H1: when a cardinal action changed >=4 masked playfield pixels and reached a
new state, additional short-term action persistence improves first-level
completion or action cost in movement games.
H2: visible change is animation/oscillation rather than directional progress;
persistence increases loops and regresses games.

Prospective outcome prediction: H1 will increase consecutive cardinal
actions following >=4-pixel visible changes, with unchanged behavior after
small/no changes. It may improve some levels but risks regressions.
H2 inverted-effect negative control should not beat H1 if visible change is
an informative affordance. These are predictions, NOT observed outcomes.
No game-ID branches, no agent promotion, no Kaggle action.
"""
from __future__ import annotations
import sys
from pathlib import Path
import types
import unittest
from test_agent import FrameData, GameAction, MyAgent as Frozen
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from ul003_cardinal_motion_variant import generate

SOURCE = (Path(__file__).resolve().parents[1] / "agent" / "my_agent.py").read_text()

def candidate(arm):
    m = types.ModuleType("ul003_" + arm)
    exec(compile(generate(SOURCE, arm), "<ul003>", "exec"), m.__dict__)
    return m.MyAgent

class UL003Tests(unittest.TestCase):
    def test_source_guard(self):
        with self.assertRaises(ValueError):
            generate(SOURCE.replace("value += 0.55", "value += 0.54"), "effect")
    def test_unknown_arm_rejected(self):
        with self.assertRaises(ValueError):
            generate(SOURCE, "bad")
    def test_preserves_frozen_interface_and_legality(self):
        for arm in ("effect", "inverted"):
            cls = candidate(arm)
            a = cls(game_id="unseen-1")
            obs = FrameData(frame=[[[0]*8 for _ in range(8)]],
                            available_actions=[GameAction.ACTION1, GameAction.ACTION4])
            self.assertIn(a.choose_action([], obs), [GameAction.ACTION1, GameAction.ACTION4])
            self.assertEqual(cls._key(0, obs.frame), Frozen._key(0, obs.frame))
    def test_exactly_one_guarded_policy_change(self):
        for arm in ("effect", "inverted"):
            changed = generate(SOURCE, arm)
            self.assertEqual(changed.count("UL003 cardinal motion"), 1)
            self.assertIn("self._delta(self._last_grids, grids)", changed)
            self.assertEqual(changed.replace(changed.split("# UL003 cardinal motion")[1].split("\n")[0], ""), changed.replace(changed.split("# UL003 cardinal motion")[1].split("\n")[0], ""))

if __name__ == "__main__":
    unittest.main()
